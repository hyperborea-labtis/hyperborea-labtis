// Text helpers for <title> and meta descriptions (pure, covered by `npm test`).

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Plain text of a Markdown/HTML fragment: no markup, links reduced to their text,
 * footnote markers ([1], \[1\]) and images dropped, escapes undone, whitespace collapsed. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ") // raw HTML tags (e.g. <a id="04"></a>)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\\\[\d+\\\]|\[\d+\]/g, " ") // footnote markers, escaped or not
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/https?:\/\/[^\s)>\]]+/g, " ") // bare URLs
    .replace(/\(\s*\)/g, " ") // parentheses left empty by the removals above
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading markers
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, " ") // horizontal rules ("* * *")
    .replace(/^\s*>\s?/gm, "") // block quotes
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "") // list markers
    .replace(/(?<!\\)(?:(?<!\w)[*_`~]+|[*_`~]+(?!\w))/g, "") // emphasis marks (not escaped, not inside words)
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, "$1") // unescape
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, " ")
    .trim();
}

/** First paragraph of a Markdown body that reads as prose: skips headings, tables,
 * images, signatures and other short lines (anything under `minLength` characters). */
export function firstParagraph(markdown: string, minLength = 80): string {
  for (const block of markdown.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed || /^(#|\||!\[|<table|<figure)/.test(trimmed)) continue;
    const text = plainText(trimmed);
    if (text.endsWith(":")) continue; // introduces a list or a link, says nothing by itself
    if (text.length >= minLength) return text;
  }
  return "";
}

/** Collapse runs of whitespace (some imported titles carry double spaces). */
export const tidy = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Words a cut must not end on ("…claridad y…"): conjunctions, articles and short prepositions. */
const DANGLING = /\s+(?:y|e|o|u|de|del|la|el|las|los|lo|un|una|que|en|a|al|con|por|para|como|se|su|sus|más|the|and|or|of|to|in|an|for|on|with|by|le|les|du|des|et|ou|une|qui|dans|pour|par|sur|avec|à|au|aux)$/i;

/** Shorten to `max` characters at a sentence end when one falls in the second half of the
 * limit, else at a word boundary with an ellipsis. */
export function truncateAtSentence(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  let end = -1;
  for (const m of cut.matchAll(/[.!?…](?=\s|$)/g)) end = m.index!;
  if (end >= max / 2) return cut.slice(0, end + 1);
  const room = cut.slice(0, max - 1);
  const space = room.lastIndexOf(" ");
  let base = (space > 0 ? room.slice(0, space) : room).replace(/[\s,;:\-–—(«"]+$/, "");
  for (let i = 0; i < 3 && DANGLING.test(base); i++) base = base.replace(DANGLING, "").replace(/[\s,;:\-–—(«"]+$/, "");
  return base + "…";
}

/** "Title | Hyperborea", but only while it stays short: search engines cut titles at about
 * 60 characters, so a long scholarly title goes alone rather than losing its end to the brand. */
export function pageTitle(title: string, brand = "Hyperborea", max = 65): string {
  const full = `${title} | ${brand}`;
  return full.length <= max ? full : title;
}
