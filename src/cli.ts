#!/usr/bin/env node
// read-along: narrate Markdown files on this machine, for free.
//
//   npx read-along posts/*.md --out public/audio
//   npx read-along posts/*.md --out public/audio --voice af_heart --force
//
// Writes <out>/<name>.mp3 and <name>.json next to each other. Skips files whose text and voice
// haven't changed since they were last narrated.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { hashBlocks, markdownBlocks, stripFrontMatter } from "./blocks.js";
import { KOKORO_MODEL, narrate } from "./narrate.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "audio" },
    voice: { type: "string", default: "am_michael" },
    dtype: { type: "string", default: "fp32" },
    kbps: { type: "string", default: "32" },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || !positionals.length) {
  console.log("Usage: read-along <file.md ...> [--out dir] [--voice am_michael] [--dtype fp32|q8] [--kbps 32] [--force]");
  process.exit(values.help ? 0 : 1);
}

const jobs = positionals
  .map((file) => {
    const blocks = markdownBlocks(stripFrontMatter(readFileSync(file, "utf8")));
    return { file, name: basename(file).replace(/\.mdx?$/, ""), blocks, hash: hashBlocks(blocks, values.voice!) };
  })
  .filter((j) => {
    if (values.force) return true;
    try {
      return JSON.parse(readFileSync(join(values.out!, `${j.name}.json`), "utf8")).hash !== j.hash;
    } catch {
      return true;
    }
  });

if (!jobs.length) {
  console.log("Nothing to narrate: everything is current.");
  process.exit(0);
}

mkdirSync(values.out!, { recursive: true });
console.log(`Narrating ${jobs.length} file(s) with ${values.voice}. Loading Kokoro (the first run downloads the model)…`);
const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: values.dtype as "fp32" | "q8", device: "cpu" });
const started = Date.now();
for (const [n, j] of jobs.entries()) {
  const t = Date.now();
  const { mp3, meta } = await narrate({ tts, Splitter: TextSplitterStream }, j.blocks, { voice: values.voice!, hash: j.hash, kbps: Number(values.kbps) });
  writeFileSync(join(values.out!, `${j.name}.mp3`), mp3);
  writeFileSync(join(values.out!, `${j.name}.json`), JSON.stringify(meta));
  console.log(`${n + 1}/${jobs.length} ${j.name}: ${(meta.duration / 60).toFixed(1)} min, ${(mp3.length / 1e6).toFixed(1)} MB, ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
console.log(`Done in ${((Date.now() - started) / 60000).toFixed(1)} min.`);
