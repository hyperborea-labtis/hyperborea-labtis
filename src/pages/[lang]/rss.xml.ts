// Feed at /{lang}/rss.xml — same location as the current Drupal site.
import type { APIRoute, GetStaticPaths } from "astro";
import { locales, type Locale } from "../../i18n/config";
import { papersForLocale, articlesForLocale } from "../../lib/content";

export const getStaticPaths = (() => locales.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

const FEED_ITEMS = 20;

type Item = { title: string; path: string; date?: Date; summary?: string };

const xml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Locale;
  const origin = site?.origin ?? "";
  const [papers, articles] = await Promise.all([papersForLocale(lang), articlesForLocale(lang)]);
  const items: Item[] = [
    ...papers.map((p) => ({
      title: p.data.title,
      path: `/${lang}/paper/${p.data.slug}`,
      date: p.data.publishedDate,
      summary: p.data.abstract,
    })),
    ...articles.map((a) => ({
      title: a.data.title,
      path: `/${lang}/actividad/${a.data.slug}`,
      date: a.data.publishedDate,
    })),
  ]
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, FEED_ITEMS);

  const body = items
    .map(
      (i) =>
        `    <item>\n      <title>${xml(i.title)}</title>\n      <link>${origin}${i.path}</link>\n      <guid isPermaLink="true">${origin}${i.path}</guid>\n` +
        (i.date ? `      <pubDate>${i.date.toUTCString()}</pubDate>\n` : "") +
        (i.summary ? `      <description>${xml(i.summary)}</description>\n` : "") +
        `    </item>`,
    )
    .join("\n");

  const feed =
    `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0">\n  <channel>\n` +
    `    <title>Hyperborea - Revista de ensayo y creación</title>\n    <link>${origin}/${lang}</link>\n` +
    `    <description>Hyperborea. Revista de ensayo y creación</description>\n    <language>${lang}</language>\n${body}\n  </channel>\n</rss>\n`;

  return new Response(feed, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
