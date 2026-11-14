import { getCollection, type CollectionEntry } from "astro:content";
import { defaultLocale, type Locale } from "../i18n/config";

export type Paper = CollectionEntry<"papers">;
export type Article = CollectionEntry<"articles">;
export type Page = CollectionEntry<"pages">;

// Locale comes from frontmatter when present, else from the entry id
// ("{locale}/{slug}") — so content edited by the CMS (folder-based i18n) still
// resolves without a `lang` field.
function langOf(entry: Paper | Article | Page): Locale {
  return (entry.data.lang ?? (entry.id.split("/")[0] as Locale)) as Locale;
}

function byDateDesc(a: { data: { publishedDate?: Date } }, b: { data: { publishedDate?: Date } }): number {
  const da = a.data.publishedDate?.getTime() ?? 0;
  const db = b.data.publishedDate?.getTime() ?? 0;
  return db - da;
}

/**
 * One entry per slug for a locale: prefer the locale's own version, then the
 * default language. Grouping by slug (not translationKey) handles both real
 * translations and same-slug-per-language nodes (the institutional pages exist
 * as separate nodes per language sharing one alias). Papers are mostly es-only,
 * so other locales fall back to es.
 */
function pickByLocale<T extends Paper | Article | Page>(entries: T[], locale: Locale): T[] {
  const bySlug = new Map<string, T>();
  for (const entry of entries) {
    const key = entry.data.slug;
    const current = bySlug.get(key);
    if (!current) {
      bySlug.set(key, entry);
      continue;
    }
    const rank = (e: T) =>
      langOf(e) === locale ? 2 : langOf(e) === defaultLocale ? 1 : 0;
    if (rank(entry) > rank(current)) bySlug.set(key, entry);
  }
  return [...bySlug.values()];
}

export async function papersForLocale(locale: Locale): Promise<Paper[]> {
  const papers = await getCollection("papers", (e) => !e.data.draft);
  return pickByLocale(papers, locale).sort(byDateDesc);
}

export async function paperBySlug(locale: Locale, slug: string): Promise<Paper | undefined> {
  const papers = await papersForLocale(locale);
  return papers.find((p) => p.data.slug === slug);
}

export async function articlesForLocale(locale: Locale): Promise<Article[]> {
  const articles = await getCollection("articles", (e) => !e.data.draft);
  return pickByLocale(articles, locale).sort(byDateDesc);
}

export async function articleBySlug(locale: Locale, slug: string): Promise<Article | undefined> {
  const articles = await articlesForLocale(locale);
  return articles.find((a) => a.data.slug === slug);
}

export async function pagesForLocale(locale: Locale): Promise<Page[]> {
  const pages = await getCollection("pages", (e) => !e.data.draft);
  return pickByLocale(pages, locale);
}

export async function pageBySlug(locale: Locale, slug: string): Promise<Page | undefined> {
  const pages = await pagesForLocale(locale);
  return pages.find((p) => p.data.slug === slug);
}

// Fallback order for papers with no explicit position: grouped by section…
const SECTION_ORDER = ["Mare Sugenum", "Manet et manebit", "Kino LabTIS", "Afinidades electivas"];

function inIssueOrder(a: Paper, b: Paper): number {
  // Explicit position (imported from Drupal, editable in the CMS) wins; papers
  // without one follow, ordered by the fallback below.
  const oa = a.data.issueOrder;
  const ob = b.data.issueOrder;
  if (oa !== undefined && ob !== undefined) return oa - ob;
  if (oa !== undefined || ob !== undefined) return oa !== undefined ? -1 : 1;
  const rank = (p: Paper) => {
    const i = SECTION_ORDER.indexOf(p.data.section ?? "");
    return i === -1 ? SECTION_ORDER.length : i;
  };
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  // …then by original Drupal node id (imported papers); papers created in the
  // CMS have none, so they follow by date and title.
  const nid = (p: Paper) => (p.data.translationKey ? Number(p.data.translationKey) : NaN);
  const na = nid(a);
  const nb = nid(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  return (a.data.publishedDate?.getTime() ?? 0) - (b.data.publishedDate?.getTime() ?? 0) || a.data.title.localeCompare(b.data.title);
}

export async function papersInIssue(locale: Locale, issue: number): Promise<Paper[]> {
  const papers = await papersForLocale(locale);
  return papers.filter((p) => p.data.issue === issue).sort(inIssueOrder);
}

export async function papersInSection(locale: Locale, sectionLabel: string): Promise<Paper[]> {
  const papers = await papersForLocale(locale);
  return papers.filter((p) => p.data.section === sectionLabel);
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Papers tagged with a keyword (matched by name, ignoring case). */
export async function papersWithKeyword(locale: Locale, keyword: string): Promise<Paper[]> {
  const papers = await papersForLocale(locale);
  const wanted = norm(keyword);
  return papers.filter((p) => p.data.keywords.some((k) => norm(k) === wanted));
}

const HOME_ITEMS = 6;

/** Papers shown on the home page: those with a `featured` position, in that
 * order; with none set, the most recent ones. */
export async function featuredPapers(locale: Locale): Promise<Paper[]> {
  const papers = await papersForLocale(locale);
  const featured = papers
    .filter((p) => p.data.featured !== undefined)
    .sort((a, b) => (a.data.featured ?? 0) - (b.data.featured ?? 0));
  return (featured.length > 0 ? featured : papers).slice(0, HOME_ITEMS);
}

export type Publication = { title: string; href: string; image?: string };

/** Every paper and activity, newest first (ties: highest Drupal node id first). */
export async function latestPublications(locale: Locale): Promise<Publication[]> {
  const [papers, articles] = await Promise.all([papersForLocale(locale), articlesForLocale(locale)]);
  const nid = (e: Paper | Article) => Number(e.data.translationKey) || 0;
  const rows = [
    ...papers.map((e) => ({ e, href: `/${locale}/paper/${e.data.slug}` })),
    ...articles.map((e) => ({ e, href: `/${locale}/actividad/${e.data.slug}` })),
  ].sort(
    (a, b) =>
      (b.e.data.publishedDate?.getTime() ?? 0) - (a.e.data.publishedDate?.getTime() ?? 0) || nid(b.e) - nid(a.e),
  );
  return rows.map(({ e, href }) => ({ title: e.data.title, href, image: e.data.heroImage }));
}
