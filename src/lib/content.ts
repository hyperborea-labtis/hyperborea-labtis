import { getCollection, type CollectionEntry } from "astro:content";
import { defaultLocale, type Locale } from "../i18n/config";
import { SECTIONS } from "../data/nav";

export type Paper = CollectionEntry<"papers">;
export type Article = CollectionEntry<"articles">;
export type Page = CollectionEntry<"pages">;

// Locale comes from frontmatter when present, else from the entry id
// ("{locale}/{slug}") — so content edited by the CMS (folder-based i18n) still
// resolves without a `lang` field.
function langOf(entry: Paper | Article | Page): Locale {
  return (entry.data.lang ?? (entry.id.split("/")[0] as Locale)) as Locale;
}

// Newest-first key for listings: the Drupal creation timestamp when known (exact to
// the minute, so order matches the old site), else the publication date.
type Dated = { data: { created?: Date; publishedDate?: Date; translationKey?: string } };
const newestKey = (e: Dated): number => (e.data.created ?? e.data.publishedDate)?.getTime() ?? 0;
const newestFirst = (a: Dated, b: Dated): number =>
  newestKey(b) - newestKey(a) || (Number(b.data.translationKey) || 0) - (Number(a.data.translationKey) || 0);

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

/** Language of the text of an entry (its locale folder or `lang` field). Different from the
 * URL's language when the page is the Spanish fallback of an untranslated entry. */
export const contentLangOf = (entry: Paper | Article | Page): Locale => langOf(entry);

/** The language to declare on a piece of text copied from an entry, or undefined when it already
 * matches the page's (WCAG 3.1.2: only parts in another language carry their own `lang`). */
export const langIfDifferent = (entry: Paper | Article | Page, pageLang: Locale): Locale | undefined => {
  const l = langOf(entry);
  return l === pageLang ? undefined : l;
};

const realLocalesCache = new Map<string, Promise<Map<string, Locale[]>>>();

/** For every slug of a collection, the languages in which it REALLY exists (own text, not
 * the Spanish fallback). Drives hreflang: only real translations are listed. */
export function realLocales(collection: "papers" | "articles" | "pages"): Promise<Map<string, Locale[]>> {
  let cached = realLocalesCache.get(collection);
  if (!cached) {
    cached = getCollection(collection, (e) => !e.data.draft).then((entries) => {
      const bySlug = new Map<string, Locale[]>();
      for (const e of entries) {
        const found = bySlug.get(e.data.slug) ?? [];
        const lang = langOf(e);
        if (!found.includes(lang)) found.push(lang);
        bySlug.set(e.data.slug, found);
      }
      return bySlug;
    });
    realLocalesCache.set(collection, cached);
  }
  return cached;
}

export async function papersForLocale(locale: Locale): Promise<Paper[]> {
  const papers = await getCollection("papers", (e) => !e.data.draft);
  return pickByLocale(papers, locale).sort(newestFirst);
}

export async function paperBySlug(locale: Locale, slug: string): Promise<Paper | undefined> {
  const papers = await papersForLocale(locale);
  return papers.find((p) => p.data.slug === slug);
}

export async function articlesForLocale(locale: Locale): Promise<Article[]> {
  const articles = await getCollection("articles", (e) => !e.data.draft);
  return pickByLocale(articles, locale).sort(newestFirst);
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

/** The current issue is the highest issue number among published papers, so
 * opening a new issue in the CMS moves every section page to it by itself. */
export async function currentIssue(locale: Locale): Promise<number | undefined> {
  const papers = await papersForLocale(locale);
  const issues = papers.map((p) => p.data.issue).filter((n): n is number => n !== undefined);
  return issues.length > 0 ? Math.max(...issues) : undefined;
}

/** Items per page in the paginated listings (Afinidades electivas, "Ver más"). */
export const PAGE_SIZE = 6;

export type Paginated<T> = { items: T[]; page: number; totalPages: number };

/** One page (1-based) of a list; `totalPages` is at least 1. */
export function paginate<T>(all: T[], page: number, size: number = PAGE_SIZE): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  return { items: all.slice((page - 1) * size, page * size), page, totalPages };
}

/** Papers of a section in the current issue only (older issues stay reachable
 * from the issue pages and the keyword pages). */
export async function papersInSection(locale: Locale, sectionLabel: string): Promise<Paper[]> {
  const issue = await currentIssue(locale);
  const papers = await papersForLocale(locale);
  return papers
    .filter((p) => p.data.section === sectionLabel && p.data.issue === issue)
    .sort(inIssueOrder);
}

export const norm = (s: string): string => s.trim().toLowerCase();

/** Papers tagged with a keyword (matched by name, ignoring case). */
export async function papersWithKeyword(locale: Locale, keyword: string): Promise<Paper[]> {
  const papers = await papersForLocale(locale);
  const wanted = norm(keyword);
  return papers.filter((p) => p.data.keywords.some((k) => norm(k) === wanted));
}

/** Every paper of a section, whatever its issue, newest first (ties: highest Drupal node id first). */
export async function papersInSectionNewestFirst(locale: Locale, sectionLabel: string): Promise<Paper[]> {
  const papers = await papersForLocale(locale);
  return papers.filter((p) => p.data.section === sectionLabel).sort(newestFirst);
}

export type Publication = { title: string; href: string; image?: string; titleLang?: Locale };

/** Every paper and activity (the `papers` and `articles` collections), newest first. */
export async function latestPublications(locale: Locale): Promise<Publication[]> {
  const [papers, articles] = await Promise.all([papersForLocale(locale), articlesForLocale(locale)]);
  const rows = [
    ...papers.map((e) => ({ e, href: `/${locale}/paper/${e.data.slug}` })),
    ...articles.map((e) => ({ e, href: `/${locale}/actividad/${e.data.slug}` })),
  ].sort((a, b) => newestFirst(a.e, b.e));
  return rows.map(({ e, href }) => ({ title: e.data.title, href, image: e.data.heroImage, titleLang: langIfDifferent(e, locale) }));
}

/** The latest papers shown on the home page: papers of the four main-menu sections
 * only (Afinidades electivas and papers without a section stay out); the full list of
 * papers and activities is paginated at /posts-3-col. */
export async function homePublications(locale: Locale): Promise<Publication[]> {
  const sections = new Set(SECTIONS.map((s) => s.label));
  const papers = (await papersForLocale(locale)).filter((p) => p.data.section && sections.has(p.data.section));
  return [...papers]
    .sort(newestFirst)
    .slice(0, PAGE_SIZE)
    .map((e) => ({ title: e.data.title, href: `/${locale}/paper/${e.data.slug}`, image: e.data.heroImage, titleLang: langIfDifferent(e, locale) }));
}
