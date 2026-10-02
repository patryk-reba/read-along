import { test } from "node:test";
import assert from "node:assert/strict";
import { hashBlocks, markdownBlocks, stripFrontMatter } from "../dist/blocks.js";

const md = `---
title: "Hello"
---
# A heading

A paragraph with \`file.name_here\` and a [link](https://example.com).

- first item
- second item

\`\`\`js
console.log("skipped");
\`\`\`

| a | b |
|---|---|
| skipped | too |

> A quote &amp; more.
`;

test("reads headings, paragraphs, list items and quotes; skips code and tables", () => {
  assert.deepEqual(markdownBlocks(stripFrontMatter(md)), [
    "A heading",
    "A paragraph with file dot name here and a link.",
    "first item",
    "second item",
    "A quote & more.",
  ]);
});

test("the hash changes with the text and with the voice", () => {
  const blocks = ["One.", "Two."];
  assert.equal(hashBlocks(blocks, "am_michael"), hashBlocks(["One.", "Two."], "am_michael"));
  assert.notEqual(hashBlocks(blocks, "am_michael"), hashBlocks(["One.", "Two!"], "am_michael"));
  assert.notEqual(hashBlocks(blocks, "am_michael"), hashBlocks(blocks, "af_heart"));
});
