// Published issues of the journal. The paper → issue link lives in each paper's
// `issue` frontmatter field; this map only holds the year shown in titles
// ("Hyperborea 8 (2025)"). To open a new issue, add one line here and use the
// number in the CMS "Número" field of its papers.
export const ISSUE_YEARS: Record<number, number> = {
  1: 2018,
  2: 2019,
  3: 2020,
  4: 2021,
  5: 2022,
  6: 2023,
  7: 2024,
  8: 2025,
};

export const ISSUE_NUMBERS = Object.keys(ISSUE_YEARS)
  .map(Number)
  .sort((a, b) => a - b);

export function issueTitle(n: number): string {
  return `Hyperborea ${n} (${ISSUE_YEARS[n]})`;
}
