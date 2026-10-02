// A framework-free player. Give it the container whose children carry data-say="n" (see
// renderMarkdown), the MP3 and its NarrationMeta; it highlights the block being read, keeps it in
// view (unless the reader is scrolling), and lets a click on any block jump the audio there.
// Styling is yours: it only toggles two classes.
import type { NarrationMeta } from "./narrate.js";

export type ReadAlongOptions = {
  /** Class added to the container while the player is attached. Default "read-along-on". */
  onClass?: string;
  /** Class added to the block being read. Default "read-along-active". */
  activeClass?: string;
  /** Keep the active block in view. Default true. */
  follow?: boolean;
  /** Called every frame while playing with loudness 0..1, for visuals. */
  onLevel?: (level: number) => void;
  /** Called when the active block changes (-1 before the first). */
  onBlock?: (index: number) => void;
};

export type ReadAlong = {
  audio: HTMLAudioElement;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  seekToBlock: (index: number) => void;
  destroy: () => void;
};

/** True when this audio was made from exactly these blocks with this voice; show the player only then. */
export const matches = (meta: NarrationMeta | null, hash: string) => !!meta && meta.hash === hash;

export function readAlong(root: HTMLElement, src: string | HTMLAudioElement, meta: NarrationMeta, opts: ReadAlongOptions = {}): ReadAlong {
  const { onClass = "read-along-on", activeClass = "read-along-active", follow = true, onLevel, onBlock } = opts;
  const audio = typeof src === "string" ? new Audio(src) : src;
  audio.preload = "auto";
  const env = Uint8Array.from(atob(meta.env), (c) => c.charCodeAt(0));
  let current = -1;
  let userAt = 0;
  let raf = 0;

  root.classList.add(onClass);

  const mark = (i: number) => {
    root.querySelector(`.${activeClass}`)?.classList.remove(activeClass);
    current = i;
    onBlock?.(i);
    const el = i >= 0 ? root.querySelector<HTMLElement>(`[data-say="${i}"]`) : null;
    if (!el) return;
    el.classList.add(activeClass);
    const r = el.getBoundingClientRect();
    const offscreen = r.top < 80 || r.top > window.innerHeight * 0.72;
    if (follow && offscreen && !audio.paused && performance.now() - userAt > 4000) {
      window.scrollTo({ top: r.top + window.scrollY - window.innerHeight * 0.3, behavior: "smooth" });
    }
  };

  const tick = () => {
    const t = audio.currentTime;
    let i = -1;
    for (let k = 0; k < meta.starts.length && meta.starts[k] <= t + 0.05; k++) i = k;
    if (i !== current) mark(i);
    onLevel?.(audio.paused ? 0 : (env[Math.floor(t * 20)] ?? 0) / 255);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const onUser = () => (userAt = performance.now());
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element;
    const el = target.closest<HTMLElement>("[data-say]");
    if (!el || target.closest("a, button") || !root.contains(el)) return;
    seekToBlock(Number(el.dataset.say));
    void audio.play();
  };
  window.addEventListener("wheel", onUser, { passive: true });
  window.addEventListener("touchmove", onUser, { passive: true });
  window.addEventListener("keydown", onUser);
  root.addEventListener("click", onClick);

  function seekToBlock(index: number) {
    audio.currentTime = meta.starts[index] ?? 0;
  }

  return {
    audio,
    play: () => audio.play(),
    pause: () => audio.pause(),
    toggle: () => (audio.paused ? audio.play() : Promise.resolve(audio.pause())),
    seekToBlock,
    destroy() {
      cancelAnimationFrame(raf);
      audio.pause();
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
      window.removeEventListener("keydown", onUser);
      root.removeEventListener("click", onClick);
      root.classList.remove(onClass);
      root.querySelector(`.${activeClass}`)?.classList.remove(activeClass);
    },
  };
}
