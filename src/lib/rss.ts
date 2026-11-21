// RSS 2.0 feed as a pure function (no Astro imports) so `npm test` covers it;
// src/pages/[lang]/rss.xml.ts feeds it. Same address as the old Drupal feed (/{lang}/rss.xml).
import type { Locale } from "../i18n/config";

export interface FeedItem {
  title: string;
  /** Absolute canonical URL (also the permalink guid). */
  url: string;
  date?: Date;
  summary?: string;
  creators?: string[];
}

export interface FeedInput {
  lang: Locale;
  origin: string;
  title: string;
  description: string;
  items: FeedItem[];
}

/** Escape text for XML and drop the control characters XML 1.0 does not allow at all. */
export function xmlText(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex -- stripping the control characters XML 1.0 forbids is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildFeed({ lang, origin, title, description, items }: FeedInput): string {
  // The newest item date, not the build time: the same content always yields the same feed.
  const newest = items.reduce<Date | undefined>((acc, i) => (i.date && (!acc || i.date > acc) ? i.date : acc), undefined);
  const body = items
    .map(
      (i) =>
        `    <item>\n      <title>${xmlText(i.title)}</title>\n      <link>${xmlText(i.url)}</link>\n      <guid isPermaLink="true">${xmlText(i.url)}</guid>\n` +
        (i.date ? `      <pubDate>${i.date.toUTCString()}</pubDate>\n` : "") +
        (i.creators ?? []).map((c) => `      <dc:creator>${xmlText(c)}</dc:creator>\n`).join("") +
        (i.summary ? `      <description>${xmlText(i.summary)}</description>\n` : "") +
        `    </item>`,
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n` +
    `    <title>${xmlText(title)}</title>\n    <link>${origin}/${lang}</link>\n    <description>${xmlText(description)}</description>\n` +
    `    <language>${lang}</language>\n` +
    (newest ? `    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>\n` : "") +
    `    <atom:link href="${origin}/${lang}/rss.xml" rel="self" type="application/rss+xml" />\n` +
    (body ? `${body}\n` : "") +
    `  </channel>\n</rss>\n`
  );
}
