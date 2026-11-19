// Indexing rules for <head>, as pure functions (no Astro imports) so `npm test` covers
// them. BaseLayout.astro feeds them and renders the result.
//
// Policy (decided with the client):
//  - Pages whose text exists in the language of the URL: self canonical, indexable,
//    hreflang between the languages that REALLY exist.
//  - Untranslated fallback (Spanish text served under /en or /fr): canonical to the Spanish
//    page, noindex,follow, no hreflang. When a real translation is added the page becomes
//    indexable by itself: nothing to flip.
//  - Search and 404 pages: noindex,follow.
//  - A non-indexable build (the workers.dev dev domain, PR previews) is noindex,nofollow
//    everywhere, whatever the rules above say. Only production sets PUBLIC_INDEXABLE=true.
import type { Locale } from "../i18n/config";

const INDEX_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

/** og:locale values (the journal is Argentine, hence es_AR). */
const OG_LOCALES: Record<Locale, string> = { es: "es_AR", en: "en_US", fr: "fr_FR" };
export const ogLocale = (lang: Locale): string => OG_LOCALES[lang];

/** Absolute URL for a site-relative path ("/es/paper/x"); the site has no trailing slashes. */
export function absoluteUrl(path: string, site: string | URL): string {
  const origin = new URL(site.toString()).origin;
  const url = new URL(path || "/", origin);
  return origin + url.pathname.replace(/(.)\/$/, "$1") + url.search + url.hash;
}

export interface HeadInput {
  lang: Locale;
  /** Locale-relative path, the same in every language ("", "/numero-8", "/paper/slug"). */
  path: string;
  site: string | URL;
  locales: readonly Locale[];
  /** Whether this build may be indexed (see isIndexableBuild). */
  indexable: boolean;
  /** Language of the text actually on the page. Different from `lang` = untranslated fallback. */
  contentLang?: Locale;
  /** Languages with REAL content at this path (default: every locale). Drives hreflang. */
  alternates?: readonly Locale[];
  noindex?: boolean;
  /** Locale-relative path of the page this one duplicates (same content, another URL, such as
   * the extra Drupal term ids of a merged keyword). Canonical goes there; this page is noindex. */
  canonicalPath?: string;
}

export interface HeadMeta {
  canonical: string;
  robots: string;
  hreflang: { hreflang: string; href: string }[];
}

export function resolveHead(input: HeadInput): HeadMeta {
  const { lang, path, site, locales, indexable, contentLang, alternates = locales, noindex = false, canonicalPath } = input;
  const fallback = contentLang !== undefined && contentLang !== lang;
  const duplicate = canonicalPath !== undefined && canonicalPath !== path;
  const at = (l: Locale, p: string = path) => absoluteUrl(`/${l}${p}`, site);

  const canonical = at(fallback ? contentLang : lang, canonicalPath ?? path);

  let robots = INDEX_ROBOTS;
  if (!indexable) robots = "noindex, nofollow";
  else if (fallback || noindex || duplicate) robots = "noindex, follow";

  const hreflang: HeadMeta["hreflang"] = [];
  // Independent of `indexable`: in a non-indexable build the pages are noindex,nofollow anyway,
  // and emitting the same hreflang keeps the structure identical (and checkable) in every build.
  if (!fallback && !noindex && !duplicate && alternates.length > 1) {
    for (const l of locales) if (alternates.includes(l)) hreflang.push({ hreflang: l, href: at(l) });
    const fallbackLocale = alternates.includes("es" as Locale) ? ("es" as Locale) : alternates[0]!;
    hreflang.push({ hreflang: "x-default", href: at(fallbackLocale) });
  }
  return { canonical, robots, hreflang };
}

/**
 * A build is indexable only when PUBLIC_INDEXABLE=true AND it is not a Workers Builds
 * preview of another branch (those get their own *.workers.dev URL and must never be
 * indexed). Anything else, including a missing variable, is NOT indexable: the safe default.
 */
export function isIndexableBuild(env: Record<string, string | undefined>): boolean {
  if (env.PUBLIC_INDEXABLE !== "true") return false;
  const branch = env.WORKERS_CI_BRANCH;
  return branch === undefined || branch === "" || branch === "main";
}
