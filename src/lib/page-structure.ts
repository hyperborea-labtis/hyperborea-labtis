// Structural accessibility of a built HTML page: the things an automated crawler can verify without a
// browser. scripts/verify.mjs runs this over every page in dist/ (check 18); the tests pin the rules.
//
//  - exactly one <h1> (WCAG 1.3.1 / 2.4.6: the page has one title)
//  - strict outline (home, listings, sections): headings never skip a level going down (h1 → h3)
//  - every <img> has an alt attribute (WCAG 1.1.1; alt="" marks it decorative)
//  - the skip link is the first link of the page and its target exists (WCAG 2.4.1)
//  - ids are unique (WCAG 4.1.1 / aria references)
//  - <html lang> is present and every lang attribute is a plausible language tag (WCAG 3.1.1, 3.1.2)

const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** The page without the parts that are not document structure: scripts, styles, templates, comments. */
function markup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "");
}

export interface StructureOptions {
  /** Also forbid skipped heading levels. For pages whose outline the templates fully control. */
  strictOutline?: boolean;
}

export function structureProblems(html: string, { strictOutline = false }: StructureOptions = {}): string[] {
  const problems: string[] = [];
  const doc = markup(html);

  // <html lang>
  const htmlTag = doc.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const htmlLang = htmlTag.match(/\blang="([^"]*)"/i)?.[1];
  if (!htmlLang) problems.push("<html lang> is missing or empty");

  // lang attributes on any element
  for (const m of doc.matchAll(/<[a-z][^>]*?\slang="([^"]*)"/gi)) {
    if (!LANG_TAG.test(m[1]) && m[1] !== "") problems.push(`invalid lang "${m[1]}"`);
  }

  // headings
  const levels = [...doc.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const h1 = levels.filter((l) => l === 1).length;
  if (h1 !== 1) problems.push(`${h1} <h1> (exactly one expected)`);
  if (strictOutline) {
    let prev = 0;
    for (const l of levels) {
      if (prev && l > prev + 1) {
        problems.push(`heading skips a level: h${prev} → h${l}`);
        break;
      }
      prev = l;
    }
  }

  // images
  const noAlt = [...doc.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\salt(=|\s|\/|>)/i.test(m[0]));
  if (noAlt.length) problems.push(`${noAlt.length} <img> without alt`);

  // skip link
  const body = doc.slice(doc.search(/<body\b/i));
  const firstLink = body.match(/<a\b[^>]*>/i)?.[0] ?? "";
  if (!/\bhref="#main-content"/.test(firstLink)) problems.push("the first link of the page is not the skip link (#main-content)");
  if (!/\bid="main-content"/.test(doc)) problems.push("skip link target #main-content does not exist");

  // unique ids
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const m of doc.matchAll(/<[a-z][^>]*?\sid="([^"]+)"/gi)) {
    if (seen.has(m[1])) dup.add(m[1]);
    seen.add(m[1]);
  }
  for (const id of [...dup].slice(0, 5)) problems.push(`duplicate id "${id}"`);
  if (dup.size > 5) problems.push(`… and ${dup.size - 5} more duplicate ids`);

  return problems;
}
