// Feed at /{lang}/rss.xml — same location as the current Drupal site. Items link to the
// canonical page: a text that exists only in Spanish points at its /es address in every feed.
import type { APIRoute, GetStaticPaths } from "astro";
import { locales, type Locale } from "../../i18n/config";
import { papersForLocale, articlesForLocale, contentLangOf } from "../../lib/content";
import { paperDescription, textDescription, siteTitle, siteDescription } from "../../lib/descriptions";
import { parseAuthors } from "../../lib/scholar";
import { buildFeed, type FeedItem } from "../../lib/rss";

export const getStaticPaths = (() => locales.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

const FEED_ITEMS = 20;

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Locale;
  const origin = site!.origin;
  const [papers, articles] = await Promise.all([papersForLocale(lang), articlesForLocale(lang)]);
  const url = (kind: "paper" | "actividad", slug: string, textLang: Locale) => `${origin}/${textLang}/${kind}/${slug}`;

  const items: FeedItem[] = [
    ...papers.map((p) => ({
      title: p.data.title,
      url: url("paper", p.data.slug, contentLangOf(p)),
      date: p.data.publishedDate ?? p.data.created,
      creators: p.data.author ? parseAuthors(p.data.author) : [],
      summary: paperDescription(contentLangOf(p), { abstract: p.data.abstract, body: p.body ?? "", author: p.data.author, issue: p.data.issue }),
    })),
    ...articles.map((a) => ({
      title: a.data.title,
      url: url("actividad", a.data.slug, contentLangOf(a)),
      date: a.data.publishedDate ?? a.data.created,
      summary: textDescription(contentLangOf(a), { body: a.body ?? "", title: a.data.title }),
    })),
  ]
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, FEED_ITEMS);

  const feed = buildFeed({ lang, origin, title: siteTitle(lang), description: siteDescription(lang), items });
  return new Response(feed, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
