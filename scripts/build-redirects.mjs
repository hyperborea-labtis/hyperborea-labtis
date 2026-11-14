#!/usr/bin/env node
/**
 * Post-build step: keep every URL of the old Drupal site alive.
 *
 * The redirects are NOT configured centrally: each content file declares what it
 * needs in its own frontmatter —
 *   • translationKey  → /{lang}/node/{translationKey} (Drupal's system URL; the
 *                        old sitemap lists it for every untranslated node)
 *   • aliases         → any extra old path that should land on that entry
 * plus the few URLs that belong to no file (EXTRAS below).
 *
 * For each redirect it writes a static HTML redirect page into dist/ (works on
 * any host and in `astro preview`) and one `_redirects` line (real 301s on
 * Cloudflare Pages). It then checks every target exists and fails the build if
 * not, or if an alias would shadow a real page.
 *
 * Run after `astro build` (part of `npm run build`).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const DIST = path.join(ROOT, "dist");
const CONTENT = path.join(ROOT, "src", "content");
const LOCALES = ["es", "en", "fr"];
const DEFAULT = "es";
// Cloudflare Pages accepts at most 2000 static redirects per project.
const MAX_REDIRECTS = 2000;

const SITE = (await fs.readFile(path.join(ROOT, "astro.config.mjs"), "utf8")).match(/const SITE = "([^"]+)"/)?.[1];
if (!SITE) throw new Error("could not read SITE from astro.config.mjs");

/** Where each collection publishes an entry. */
const canonicalPath = {
  papers: (lang, slug) => `/${lang}/paper/${slug}`,
  articles: (lang, slug) => `/${lang}/actividad/${slug}`,
  pages: (lang, slug) => `/${lang}/${slug}`,
};

async function readEntries(kind) {
  const out = [];
  const langDirs = await fs.readdir(path.join(CONTENT, kind)).catch(() => []);
  for (const dir of langDirs) {
    const files = await fs.readdir(path.join(CONTENT, kind, dir)).catch(() => []);
    for (const file of files.filter((f) => f.endsWith(".md"))) {
      const src = await fs.readFile(path.join(CONTENT, kind, dir, file), "utf8");
      const fm = YAML.parse(src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "") ?? {};
      if (fm.draft) continue; // unpublished entries have no page, so nothing to redirect to
      out.push({
        kind,
        file: `${kind}/${dir}/${file}`,
        lang: fm.lang ?? dir,
        slug: fm.slug,
        nid: fm.translationKey && /^\d+$/.test(String(fm.translationKey)) ? String(fm.translationKey) : undefined,
        aliases: Array.isArray(fm.aliases) ? fm.aliases : [],
      });
    }
  }
  return out;
}

const entries = (await Promise.all(["papers", "articles", "pages"].map(readEntries))).flat();

// A page exists in `lang` when that language has its own version or the default
// language does (the site falls back to Spanish).
const langsBySlug = new Map();
for (const e of entries) {
  const key = `${e.kind}:${e.slug}`;
  if (!langsBySlug.has(key)) langsBySlug.set(key, new Set());
  langsBySlug.get(key).add(e.lang);
}
const targetFor = (e, lang) => {
  const langs = langsBySlug.get(`${e.kind}:${e.slug}`);
  return langs.has(lang) || langs.has(DEFAULT) ? canonicalPath[e.kind](lang, e.slug) : undefined;
};

/** from → { to, why } */
const redirects = new Map();
const add = (from, to, why) => {
  from = from.length > 1 ? from.replace(/\/$/, "") : from;
  if (from === to) return;
  const prev = redirects.get(from);
  if (prev && prev.to !== to) {
    throw new Error(`conflicting redirects for ${from}: ${prev.why} → ${prev.to} vs ${why} → ${to}`);
  }
  redirects.set(from, { to, why });
};

for (const e of entries) {
  for (const lang of LOCALES) {
    const to = targetFor(e, lang);
    if (!to) continue;
    if (e.nid) add(`/${lang}/node/${e.nid}`, to, `${e.file} translationKey`);
    for (const alias of e.aliases) {
      const m = alias.match(/^\/(es|en|fr)(\/.*)$/);
      if (m) {
        if (m[1] === lang) add(alias, to, `${e.file} aliases`);
      } else {
        add(`/${lang}${alias}`, to, `${e.file} aliases`);
      }
    }
  }
}

// URLs of the old site that belong to no content file.
for (const lang of LOCALES) {
  add(`/${lang}/node/7`, `/${lang}`, "extras: Drupal theme demo page (Typography)");
  add(`/${lang}/node/45`, `/${lang}`, "extras: Drupal front-page node");
  add(`/${lang}/numero`, `/${lang}/numero-1`, "extras: /numero listing");
}
// Section pages used to be reachable by Drupal's taxonomy term id too.
const SECTION_TERMS = {
  78: "Mare_Sugenum",
  79: "Kino_LabTIS",
  80: "Manet_et_manebit",
  81: "41-9-S-71-8-W",
  392: "Afinidades_electivas",
};
for (const lang of LOCALES) {
  for (const [tid, section] of Object.entries(SECTION_TERMS)) {
    add(`/${lang}/taxonomy/term/${tid}`, `/${lang}/${section}`, "extras: section taxonomy term");
  }
}
add("/", "/es", "extras: site root");
add("/numero", "/es/numero-1", "extras: /numero listing");
add("/sitemap.xml", "/sitemap-index.xml", "extras: sitemap location");
add("/rss.xml", "/es/rss.xml", "extras: feed location");

const isFile = (p) => fs.stat(p).then((st) => st.isFile(), () => false);
const exists = (p) => fs.access(p).then(() => true, () => false);
const resolvesInDist = async (urlPath) =>
  (await isFile(path.join(DIST, urlPath))) ||
  (await isFile(path.join(DIST, `${urlPath}.html`))) ||
  (await isFile(path.join(DIST, urlPath, "index.html")));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const redirectPage = (to) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Redirecting to: ${esc(to)}</title>` +
  `<meta http-equiv="refresh" content="0;url=${esc(to)}"><meta name="robots" content="noindex">` +
  `<link rel="canonical" href="${esc(SITE + to)}"></head><body><a href="${esc(to)}">${esc(to)}</a></body></html>\n`;

const problems = [];
const lines = [];
let written = 0;
for (const [from, { to, why }] of [...redirects].sort(([a], [b]) => a.localeCompare(b))) {
  if (!(await resolvesInDist(to))) {
    problems.push(`${from} (${why}) → ${to}: target does not exist in dist/`);
    continue;
  }
  const file = from === "/" ? path.join(DIST, "index.html") : path.join(DIST, `${from}.html`);
  if (await exists(file)) {
    const html = await fs.readFile(file, "utf8");
    if (!/http-equiv="refresh"/.test(html)) {
      problems.push(`${from} (${why}) would shadow a real page`);
      continue;
    }
  } else {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, redirectPage(to));
    written++;
  }
  lines.push(`${from} ${to} 301`);
  if (from !== "/") lines.push(`${from}/ ${to} 301`);
}

if (lines.length > MAX_REDIRECTS) {
  problems.push(`${lines.length} redirect lines exceed Cloudflare's limit of ${MAX_REDIRECTS}`);
}
if (problems.length) {
  console.error(`build-redirects: ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 30)) console.error("  - " + p);
  process.exit(1);
}

await fs.writeFile(path.join(DIST, "_redirects"), lines.join("\n") + "\n");
console.log(`build-redirects: ${redirects.size} redirects (${written} new pages, ${lines.length} _redirects lines)`);
