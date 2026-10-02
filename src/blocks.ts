// What gets read aloud, and which element on the page each piece belongs to.
//
// One walk over marked's tokens serves both sides: the generator (Node or a browser tab) turns a
// Markdown document into a list of blocks to narrate, and the page renders the same Markdown with
// data-say="n" on the element each block came from. The hash ties an audio file to that exact
// text, so a page edited after narration can hide its player instead of reading stale words.
import { marked, type Token, type TokensList } from "marked";

const SILENT = new Set(["code", "table", "hr", "space", "html", "def", "image", "checkbox"]);
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Normalises text for speech: entities, separators and whitespace. */
export function tidy(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .replace(/\s*·\s*/g, ", ")
    .replace(/→/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain text of a token tree, the way it should sound. Code spans are spelled out, code blocks and tables are skipped. */
function plain(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((t) => {
      if (SILENT.has(t.type)) return "";
      if (t.type === "codespan") return t.text.replace(/(\w)\.(?=\w)/g, "$1 dot ").replace(/[_/]+/g, " ");
      if (t.type === "br") return " ";
      if (t.type === "list") return (t.items as Token[]).map((i) => plain("tokens" in i ? i.tokens : undefined)).join(" ");
      if ("tokens" in t && t.tokens) return plain(t.tokens) + (t.type === "paragraph" ? " " : "");
      return "text" in t ? String(t.text) : "";
    })
    .join("");
}

/** The spoken text of a top-level token: one per paragraph, heading or quote, one per list item; null when nothing is read. */
function units(t: Token): string[] | null {
  if (t.type === "paragraph" || t.type === "heading" || t.type === "blockquote") return [tidy(plain(t.tokens))];
  if (t.type === "list") return (t.items as Token[]).map((i) => tidy(plain("tokens" in i ? i.tokens : undefined)));
  return null;
}

/** Strips a leading YAML front matter block, if any. */
export function stripFrontMatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : md;
}

/** The blocks to narrate, in reading order. */
export function markdownBlocks(md: string): string[] {
  return marked
    .lexer(md)
    .flatMap((t) => units(t) ?? [])
    .filter(Boolean);
}

/**
 * Browser only: renders the Markdown with data-say="n" on every element that is read, and returns
 * the blocks too. Render this HTML (for example with innerHTML) and hand its container to the player.
 */
export function renderMarkdown(md: string): { html: string; blocks: string[] } {
  const tokens = marked.lexer(md);
  const tpl = document.createElement("template");
  const blocks: string[] = [];
  let html = "";
  for (const t of tokens) {
    const part = marked.parser(Object.assign([t], { links: tokens.links }) as TokensList) as string;
    const said = units(t);
    if (!said) {
      html += part;
      continue;
    }
    tpl.innerHTML = part;
    const root = tpl.content.firstElementChild;
    const targets = t.type === "list" ? [...(root?.children ?? [])] : [root];
    said.forEach((text, k) => {
      if (!text || !targets[k]) return;
      targets[k]!.setAttribute("data-say", String(blocks.length));
      blocks.push(text);
    });
    html += tpl.innerHTML;
  }
  return { html, blocks };
}

/** FNV-1a over the voice and the blocks: cheap, stable, and the same in Node and the browser. */
export function hashBlocks(blocks: string[], voice: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${voice}\n${blocks.join("\n")}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
