// Some papers carry the author's footnote marker inside the `author` field, e.g.
// "Anthony Stanton[1]" (the old site linked it to the author's bio note). The
// content keeps the text as imported; the templates split the marker off so the
// paper page can link it to the note and listings can show only the name.

export type AuthorParts = { name: string; note: string | null };

/** Splits a trailing `[n]` footnote marker from an author string. */
export function splitAuthor(author: string): AuthorParts {
  const m = /^(.*?)\s*\[(\d+)\]\s*$/.exec(author);
  return m ? { name: m[1], note: m[2] } : { name: author, note: null };
}

/** Anchor of footnote `n` (same convention as src/plugins/footnotes.mjs: "01", "02"…). */
export const noteAnchor = (n: string): string => String(parseInt(n, 10)).padStart(2, "0");
