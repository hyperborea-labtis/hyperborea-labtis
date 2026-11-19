#!/usr/bin/env node
/**
 * One-off capture of the OLD Drupal site's public URLs into scripts/legacy-urls.txt.
 * `npm run verify` (check 9) then proves every one of them still answers on the
 * new site. Run it while the old site is still online; the resulting file is
 * committed and frozen — re-running only ever adds URLs.
 *
 * Sources: the sitemap (all nodes, every language) + the internal links of the
 * home page, the contact page and the issue pages in each language (menu,
 * sections, issues…).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT = path.join(ROOT, "scripts", "legacy-urls.txt");
const ORIGIN = "https://hyperborea-labtis.org";
const LOCALES = ["es", "en", "fr"];

const urls = new Set();
try {
  for (const l of (await fs.readFile(OUT, "utf8")).split("\n")) if (l.trim()) urls.add(l.trim());
} catch {
  /* first run */
}

const text = async (p) => {
  const res = await fetch(ORIGIN + p, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${p}`);
  return res.text();
};

// 1. sitemap
for (const m of (await text("/sitemap.xml")).matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)) {
  urls.add(decodeURI(m[1]));
}

// 2. internal links of key pages (menus, sections, issues, footer)
const pages = LOCALES.flatMap((l) => [`/${l}`, `/${l}/contact`, ...[1, 8].map((n) => `/${l}/numero-${n}`)]);
for (const p of pages) {
  for (const m of (await text(p)).matchAll(/href="(\/(?:es|en|fr)(?:\/[^"?#]*)?)"/g)) {
    const href = decodeURI(m[1]);
    if (/^\/(es|en|fr)\/(user|admin|search|node)(\/|$)/.test(href)) continue; // Drupal internals
    urls.add(href.length > 1 ? href.replace(/\/$/, "") : href);
  }
}

const sorted = [...urls].sort();
await fs.writeFile(OUT, sorted.join("\n") + "\n");
console.log(`${sorted.length} URLs written to scripts/legacy-urls.txt`);
