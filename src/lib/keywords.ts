import { norm } from "./content";

export type KeywordTerm = { id: string; name: string };

type RawTerm = { name: string; tid?: number | null; alsoTids?: number[] | null };

/** URL id of a term: the old Drupal term id when it has one (so the indexed
 * /taxonomy/term/<tid> URLs keep working), else a slug of its name (terms added
 * in the CMS). Keep in sync with scripts/verify.mjs. */
export function termId(term: RawTerm): string {
  if (term.tid) return String(term.tid);
  return term.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// One JSON file per term in src/data/keywords/ (a CMS folder collection, so
// editors get a searchable, sortable list).
const files = import.meta.glob<RawTerm>("../data/keywords/*.json", { eager: true, import: "default" });
const terms = Object.values(files)
  .filter((t) => t.name.trim() !== "")
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

/** Every keyword page: one per term, plus one per extra Drupal id (`alsoTids`)
 * of terms that were merged because the CMS menu needs unique names. */
export const keywordPages: KeywordTerm[] = terms.flatMap((t) => [
  { id: termId(t), name: t.name.trim() },
  ...(t.alsoTids ?? []).map((tid) => ({ id: String(tid), name: t.name.trim() })),
]);

/** Normalized name → term id (the primary one, which is what papers link to). */
export const termIdByName: Map<string, string> = new Map(terms.map((t) => [norm(t.name), termId(t)]));
