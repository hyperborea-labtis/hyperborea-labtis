// "Related papers" block under an article: internal links that help readers and crawlers move
// between texts on the same subject. Pure function (no Astro imports) so `npm test` covers it.
//
// Score: every shared keyword weighs 10; sharing the issue adds 2 and the section 1. A paper
// qualifies with at least one shared keyword or the same issue, so a keyword always beats mere
// proximity. Ties go to the newest paper, then to the slug, so the output never depends on the
// order of the input.

export interface RelatedInput {
  slug: string;
  keywords: readonly string[];
  issue?: number;
  section?: string;
  /** Sort key, newest first (ms since epoch; 0 when unknown). */
  date: number;
}

const fold = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

export function relatedPapers<T extends RelatedInput>(current: T, all: readonly T[], limit = 4): T[] {
  const mine = new Set(current.keywords.map(fold));
  const scored: { paper: T; score: number }[] = [];
  for (const paper of all) {
    if (paper.slug === current.slug) continue;
    const shared = new Set(paper.keywords.map(fold).filter((k) => mine.has(k))).size;
    const sameIssue = current.issue !== undefined && paper.issue === current.issue;
    if (shared === 0 && !sameIssue) continue;
    const sameSection = current.section !== undefined && paper.section === current.section;
    scored.push({ paper, score: shared * 10 + (sameIssue ? 2 : 0) + (sameSection ? 1 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || b.paper.date - a.paper.date || a.paper.slug.localeCompare(b.paper.slug));
  return scored.slice(0, limit).map((s) => s.paper);
}
