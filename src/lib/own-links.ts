// Links to this very site must be relative ("/es/paper/x"), not absolute: absolute ones
// break on every other host (previews, the workers.dev dev domain), skip the router and
// still point at the old `www` host. Pure functions (no Astro imports) so `npm test`
// covers them; scripts/relativize-links.mjs applies them and scripts/verify.mjs enforces them.
//
// Only link DESTINATIONS are touched: markdown `](url)` and html `href=`/`src=`. A URL that is
// the visible text of a citation ("URL: https://…") stays as written, and the frontmatter
// `sourceUrl` (the old Drupal address, kept on purpose) is not a destination, so it stays too.

const HOST = String.raw`https?:\/\/(?:www\.)?hyperborea-labtis\.org(?=[/?#)>"'\s]|$)`;
// Markdown destination: `](url)`, `](<url>)`, `](< url>)`, `](url "title")`.
const MARKDOWN = new RegExp(String.raw`(\]\(\s*<?)\s*${HOST}([^\s)>"']*)`, "gi");
// HTML attribute: href="url" / src='url'.
const HTML = new RegExp(String.raw`(\b(?:href|src)\s*=\s*["'])\s*${HOST}([^"'\s]*)`, "gi");

/** What follows the host ("/es/x?q#h", "", "#top") as a site-relative target. */
function target(rest: string): string {
  const pathOnly = rest.split(/[?#]/)[0]!;
  const last = pathOnly.split("/").pop() ?? "";
  // An email address once turned into a page link ("…/es/actividad/a@b.com") is a mailto.
  if (last.includes("@") && !last.includes("\\")) return `mailto:${last}`;
  return rest === "" || /^[?#]/.test(rest) ? `/${rest}` : rest;
}

export function relativizeOwnLinks(text: string): string {
  return text.replace(MARKDOWN, (_m, open: string, rest: string) => open + target(rest)).replace(HTML, (_m, open: string, rest: string) => open + target(rest));
}

/** Absolute own-domain destinations in a document, in order (what relativizeOwnLinks would change). */
export function findOwnLinks(text: string): string[] {
  const found: { index: number; url: string }[] = [];
  for (const re of [MARKDOWN, HTML]) {
    for (const m of text.matchAll(re)) {
      const url = /https?:\/\/[^\s)>"']*/i.exec(m[0].slice(m[1]!.length))?.[0] ?? "";
      found.push({ index: m.index, url });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.url);
}
