// Turns blocks of text into one MP3 plus the timing a player needs: when each block starts, and a
// loudness envelope (handy for driving a visual while it plays). Kokoro does the speech, lamejs
// encodes. Runs in Node and in the browser: nothing here touches the DOM or the file system.
import { Mp3Encoder } from "@breezystack/lamejs";
import type { KokoroTTS, TextSplitterStream } from "kokoro-js";

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** For browsers: load Kokoro from a CDN at narration time instead of bundling it (and its 21 MB WebAssembly engine). */
export const KOKORO_WEB = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const RATE = 24000; // Kokoro's output rate
const MP3_RATE = 22050; // see encodeMp3
const ENV_HZ = 20;

export type NarrationMeta = {
  v: 1;
  voice: string;
  hash: string;
  /** Seconds. */
  duration: number;
  /** When each block starts, in seconds; the index matches data-say on the page. */
  starts: number[];
  /** Loudness at 20 Hz, 0 to 255, base64. */
  env: string;
};

/** What narrate() needs from kokoro-js: the Node package, or the CDN build in a browser. */
export type Kokoro = { tts: KokoroTTS; Splitter: typeof TextSplitterStream };

export type NarrateOptions = {
  voice: string;
  hash: string;
  /** MP3 bitrate in kb/s. 32 is plenty for speech: about 240 KB a minute. */
  kbps?: number;
  /** Silence between blocks, in seconds. */
  gap?: number;
  onProgress?: (done: number, total: number) => void;
};

export async function narrate({ tts, Splitter }: Kokoro, blocks: string[], { voice, hash, kbps = 32, gap = 0.5, onProgress }: NarrateOptions): Promise<{ mp3: Uint8Array; meta: NarrationMeta }> {
  const parts: Float32Array[] = [];
  const starts: number[] = [];
  let length = 0;
  const push = (a: Float32Array) => {
    parts.push(a);
    length += a.length;
  };
  const pause = (s: number) => push(new Float32Array(Math.round(RATE * s)));

  pause(0.25);
  for (let i = 0; i < blocks.length; i++) {
    starts.push(Math.round((length / RATE) * 100) / 100);
    // A closed splitter: given a bare string, kokoro-js 1.2 waits forever for more text.
    const text = new Splitter();
    text.push(blocks[i]);
    text.close();
    for await (const chunk of tts.stream(text, { voice: voice as never })) push(chunk.audio.audio as Float32Array);
    pause(gap);
    onProgress?.(i + 1, blocks.length);
  }

  const pcm = new Float32Array(length);
  let at = 0;
  for (const p of parts) {
    pcm.set(p, at);
    at += p.length;
  }
  return { mp3: encodeMp3(pcm, kbps), meta: { v: 1, voice, hash, duration: Math.round((length / RATE) * 100) / 100, starts, env: envelope(pcm) } };
}

function envelope(pcm: Float32Array): string {
  const win = RATE / ENV_HZ;
  const rms: number[] = [];
  for (let i = 0; i < pcm.length; i += win) {
    let sum = 0;
    const end = Math.min(pcm.length, i + win);
    for (let j = i; j < end; j++) sum += pcm[j] * pcm[j];
    rms.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  // Scale to the 98th percentile so one loud syllable doesn't flatten the rest.
  const peak = Math.max(1e-6, rms.slice().sort((a, b) => a - b)[Math.floor(rms.length * 0.98)] ?? 0);
  let bin = "";
  for (const r of rms) bin += String.fromCharCode(Math.min(255, Math.round((r / peak) * 255)));
  return btoa(bin);
}

// lamejs picks 22.05 kHz for 32 kb/s mono, and its own 24 to 22.05 kHz resampler writes silence.
// So the audio is resampled here, and the encoder only ever sees its output rate.
function encodeMp3(pcm: Float32Array, kbps: number): Uint8Array {
  const n = Math.floor((pcm.length * MP3_RATE) / RATE);
  const ints = new Int16Array(n);
  const step = RATE / MP3_RATE;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const v = pcm[j] + ((pcm[j + 1] ?? pcm[j]) - pcm[j]) * (x - j);
    ints[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  const enc = new Mp3Encoder(1, MP3_RATE, kbps);
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i += 1152) {
    const mp3 = enc.encodeBuffer(ints.subarray(i, i + 1152));
    if (mp3.length) out.push(mp3.slice());
  }
  out.push(enc.flush().slice());
  const bytes = new Uint8Array(out.reduce((sum, b) => sum + b.length, 0));
  let at = 0;
  for (const b of out) {
    bytes.set(b, at);
    at += b.length;
  }
  return bytes;
}
