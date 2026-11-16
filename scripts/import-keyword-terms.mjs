#!/usr/bin/env node
/**
 * Import the keyword vocabulary of the Drupal site (taxonomy_term--mt_product_tags)
 * into src/data/keywords/<tid>.json, one file per term: { "name", "tid", "alsoTids"? }.
 * Imported terms are rewritten; terms added in the CMS (files without `tid`) are
 * kept untouched.
 *
 * Why: the old site published every keyword at /{lang}/taxonomy/term/<tid> and
 * those URLs are already indexed, so they must keep working. The page lists the
 * papers whose `keywords` frontmatter contains the term name (see
 * src/pages/[lang]/taxonomy/term/[tid].astro).
 *
 * Usage: node scripts/import-keyword-terms.mjs   (npm run import:terms)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://hyperborea-labtis.org";
const OUT = path.resolve(fileURLToPath(import.meta.url), "../../src/data/keywords");

const terms = new Map();
let url = `${ORIGIN}/es/jsonapi/taxonomy_term/mt_product_tags?page%5Blimit%5D=50`;
while (url) {
  const res = await fetch(url.replace(/^http:/, "https:"), { headers: { Accept: "application/vnd.api+json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  for (const t of json.data) {
    const tid = t.attributes.drupal_internal__tid;
    const name = String(t.attributes.name ?? "").trim();
    if (tid && name) terms.set(String(tid), name);
  }
  url = json.links?.next?.href;
}

// The CMS menu needs unique names: terms that share a name (different Drupal
// ids) become one entry; the highest id is the primary, the others `alsoTids`.
const byName = new Map();
for (const [tid, name] of [...terms].sort(([a], [b]) => Number(a) - Number(b))) {
  const e = byName.get(name);
  if (e) {
    e.alsoTids.push(e.tid);
    e.tid = Number(tid);
  } else {
    byName.set(name, { name, tid: Number(tid), alsoTids: [] });
  }
}
await fs.mkdir(OUT, { recursive: true });
for (const { alsoTids, ...t } of byName.values()) {
  const entry = alsoTids.length ? { ...t, alsoTids } : t;
  await fs.writeFile(path.join(OUT, `${t.tid}.json`), JSON.stringify(entry, null, 2) + "\n");
}
console.log(`keyword terms: ${byName.size} imported from Drupal → ${path.relative(process.cwd(), OUT)}/`);
