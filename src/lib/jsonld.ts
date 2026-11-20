// schema.org JSON-LD builders (pure, covered by `npm test`). Each page's graph carries the
// nodes it needs in full (publisher, journal, issue), linked by @id, because search engines do
// not follow references to other pages.
import { JOURNAL } from "../data/journal.ts";
import { absoluteUrl } from "./seo.ts";
import type { Locale } from "../i18n/config";

type Json = Record<string, unknown>;

const ids = (site: string) => ({ publisher: `${absoluteUrl("/", site)}#labtis`, journal: `${absoluteUrl("/", site)}#journal`, website: `${absoluteUrl("/", site)}#website` });

export function organizationNode(site: string): Json {
  const p = JOURNAL.publisher;
  return {
    "@type": "ResearchOrganization",
    "@id": ids(site).publisher,
    name: p.name,
    alternateName: p.alternateName,
    url: absoluteUrl("/", site),
    address: { "@type": "PostalAddress", ...p.address },
    parentOrganization: { "@type": "CollegeOrUniversity", name: p.parent },
  };
}

export function periodicalNode(site: string): Json {
  return {
    "@type": "Periodical",
    "@id": ids(site).journal,
    name: JOURNAL.name,
    issn: JOURNAL.issn,
    url: absoluteUrl("/", site),
    inLanguage: ["es", "en", "fr"],
    isAccessibleForFree: true,
    license: JOURNAL.license,
    publisher: { "@id": ids(site).publisher },
  };
}

export function websiteNode(site: string, lang: Locale): Json {
  return {
    "@type": "WebSite",
    "@id": ids(site).website,
    name: JOURNAL.shortName,
    alternateName: JOURNAL.name,
    url: absoluteUrl("/", site),
    inLanguage: lang,
    publisher: { "@id": ids(site).publisher },
  };
}

export function issueNode(site: string, { lang, n, year, title }: { lang: Locale; n: number; year: number; title: string }): Json {
  const url = absoluteUrl(`/${lang}/numero-${n}`, site);
  return {
    "@type": "PublicationIssue",
    "@id": `${url}#issue`,
    name: title,
    issueNumber: String(n),
    datePublished: String(year),
    url,
    isPartOf: { "@id": ids(site).journal },
  };
}

export interface ArticleInput {
  lang: Locale;
  url: string;
  title: string;
  authors: string[];
  institution?: string;
  date?: string;
  keywords: string[];
  abstract?: string;
  section?: string;
  image?: string;
  pdfUrl?: string;
  issue: Json;
}

const HEADLINE_MAX = 110;

export function articleNode(site: string, a: ArticleInput): Json {
  const node: Json = {
    "@type": "ScholarlyArticle",
    "@id": `${a.url}#article`,
    name: a.title,
    headline: a.title.length > HEADLINE_MAX ? a.title.slice(0, HEADLINE_MAX - 1).replace(/\s+\S*$/, "") + "…" : a.title,
    url: a.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": a.url },
    inLanguage: a.lang,
    isPartOf: { "@id": a.issue["@id"] },
    publisher: { "@id": ids(site).publisher },
    license: JOURNAL.license,
    isAccessibleForFree: true,
  };
  if (a.authors.length) {
    node.author = a.authors.map((name) => ({
      "@type": "Person",
      name,
      ...(a.authors.length === 1 && a.institution?.trim() ? { affiliation: { "@type": "Organization", name: a.institution.trim() } } : {}),
    }));
  }
  if (a.date) node.datePublished = a.date;
  if (a.keywords.length) node.keywords = a.keywords.join(", ");
  if (a.abstract) node.abstract = a.abstract;
  if (a.section) node.articleSection = a.section;
  if (a.image) node.image = a.image;
  if (a.pdfUrl) node.associatedMedia = { "@type": "MediaObject", contentUrl: a.pdfUrl, encodingFormat: "application/pdf" };
  return node;
}

export interface TextPageInput { lang: Locale; url: string; title: string; description: string; date?: string; image?: string }

/** A news-style activity post (symposium, seminar, book launch…). */
export function activityNode(site: string, a: TextPageInput): Json {
  const node: Json = {
    "@type": "Article",
    "@id": `${a.url}#article`,
    headline: a.title.length > HEADLINE_MAX ? a.title.slice(0, HEADLINE_MAX - 1).replace(/\s+\S*$/, "") + "…" : a.title,
    description: a.description,
    url: a.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": a.url },
    inLanguage: a.lang,
    publisher: { "@id": ids(site).publisher },
  };
  if (a.date) node.datePublished = a.date;
  if (a.image) node.image = a.image;
  return node;
}

/** An institutional page (presentation, call for papers…). */
export function pageNode(site: string, a: TextPageInput): Json {
  const node: Json = { "@type": "WebPage", "@id": `${a.url}#webpage`, name: a.title, description: a.description, url: a.url, inLanguage: a.lang, isPartOf: { "@id": ids(site).website } };
  if (a.date) node.datePublished = a.date;
  return node;
}

/** BreadcrumbList; `path` is locale-relative ("" is the home). The last item has no link. */
export function breadcrumbNode(site: string, lang: Locale, items: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(i < items.length - 1 ? { item: absoluteUrl(`/${lang}${it.path}`, site) } : {}),
    })),
  };
}

/** One <script type="application/ld+json"> payload. `<` is escaped so no string can close the tag. */
export function serializeJsonLd(graph: Json[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
