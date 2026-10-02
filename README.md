# read-along

**Free AI narration for your articles, with the paragraph being read highlighted.**

Press Listen on any post at [patrykreba.com/blog](https://patrykreba.com/blog) to see it working: the voice reads the post, the paragraph it is reading lights up, the page follows along, and clicking any paragraph jumps there.

- **$0 per listen, $0 to make.** [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (82M parameters, Apache 2.0) runs on your laptop or in a browser tab. No API key, no per-character bill.
- **Ahead of time, not per visitor.** Narrate once, serve a plain MP3 from any static host. About 240 KB a minute at 32 kb/s.
- **Read-along out of the box.** Each Markdown paragraph, heading, quote or list item becomes a block with a start time; the page tags the matching elements with `data-say`, so the player knows what to highlight.
- **Never reads stale text.** The audio carries a hash of the exact blocks and voice. Edit the post and the hash stops matching, so you hide the player until it is narrated again.
- **Built for real Markdown.** Code blocks and tables are skipped, code spans are spelled out (`config.yaml` becomes "config dot yaml"), links read as their text.

## Narrate (CLI)

```bash
npm install github:patryk-reba/read-along
npx read-along posts/*.md --out public/audio
```

Each `posts/foo.md` becomes `public/audio/foo.mp3` and `public/audio/foo.json`. Files whose text and voice haven't changed are skipped; `--force` redoes them, `--voice af_heart` changes the voice ([Kokoro's voices](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)). The first run downloads the model (about 330 MB, cached after). On an Apple-silicon CPU it narrates about four times faster than real time.

## Play (browser)

```ts
import { hashBlocks, matches, readAlong, renderMarkdown } from "read-along";

const { html, blocks } = renderMarkdown(markdown); // same rules the CLI used
article.innerHTML = html; // elements that are read carry data-say="n"

const meta = await fetch("/audio/foo.json").then((r) => r.json());
if (matches(meta, hashBlocks(blocks, meta.voice))) {
  const player = readAlong(article, `/audio/foo.mp3?v=${meta.hash}`, meta, {
    onLevel: (level) => glow.style.opacity = String(level), // loudness 0..1, every frame
  });
  listenButton.onclick = () => player.toggle();
}
```

Style the two classes it toggles however you like:

```css
.read-along-on [data-say] { cursor: pointer; transition: opacity 0.5s; }
.read-along-on [data-say]:not(.read-along-active) { opacity: 0.45; }
.read-along-active { background: linear-gradient(90deg, rgb(255 181 71 / 0.1), transparent); }
```

## Narrate in the browser

`narrate()` has no Node or DOM dependencies, so a CMS can narrate a post when it is published, in the editor's own tab (WebGPU when available, about three times faster than real time):

```ts
import { KOKORO_MODEL, KOKORO_WEB, markdownBlocks, hashBlocks, narrate } from "read-along";

const { KokoroTTS, TextSplitterStream } = await import(/* @vite-ignore */ KOKORO_WEB);
const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: "fp32", device: "webgpu" });
const blocks = markdownBlocks(body);
const { mp3, meta } = await narrate({ tts, Splitter: TextSplitterStream }, blocks, { voice: "am_michael", hash: hashBlocks(blocks, "am_michael") });
// upload mp3 and JSON.stringify(meta) next to each other
```

Loading Kokoro from the CDN keeps it (and its 21 MB WebAssembly engine) out of your site bundle.

## Two things I learned building it

- **kokoro-js 1.2 never finishes a stream started from a plain string**: its sentence splitter waits for more text. `narrate()` passes a closed `TextSplitterStream` instead.
- **lamejs writes silent MP3s when it resamples.** At 32 kb/s mono it picks 22.05 kHz, and its own 24 to 22.05 kHz resampler outputs zeros (the player's clock still runs, so it looks fine until you listen). `narrate()` resamples before encoding. If you change the pipeline, check the output with `ffmpeg -i out.mp3 -af volumedetect -f null -`.

## The JSON

```ts
type NarrationMeta = {
  v: 1;
  voice: string; // Kokoro voice id
  hash: string; // hashBlocks(blocks, voice) at narration time
  duration: number; // seconds
  starts: number[]; // when each block starts; index = data-say
  env: string; // loudness at 20 Hz, 0..255, base64
};
```

## Licence

MIT. Kokoro's weights are Apache 2.0. Built by [Patryk Reba](https://patrykreba.com) for his own site; the [write-up of how the site's narration works](https://patrykreba.com/blog) is in the field notes.
