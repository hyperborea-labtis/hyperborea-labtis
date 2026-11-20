// Some papers already carry the author's own abstract inside the text, as a "Resumen" /
// "Abstract" / "Résumé" heading near the top. The page must not print a second one above it
// (the frontmatter `abstract` still feeds the meta description and the JSON-LD). Pure function
// so `npm test` covers it; scripts/verify.mjs checks the built pages for the same duplication.

const HEADING = /^[\s>*_#-]*(?:resumen|abstract|résumé|resume|resumo)\s*[*_:.-]*\s*$/i;

/** Whether the Markdown body opens with its own abstract: a line that is just the word
 * "Resumen" (or Abstract, Résumé…), in the first third of the text. */
export function bodyHasAbstract(body: string): boolean {
  const head = body.slice(0, Math.floor(body.length * 0.35) + 600);
  return head.split("\n").some((line) => HEADING.test(line));
}
