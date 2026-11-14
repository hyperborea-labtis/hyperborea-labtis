#!/usr/bin/env node
/**
 * Import the keyword vocabulary of the Drupal site (taxonomy_term--mt_product_tags)
 * as src/data/keyword-terms.json: { "<tid>": "<name>" }.
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
const OUT = path.resolve(fileURLToPath(import.meta.url), "../../src/data/keyword-terms.json");

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

const sorted = Object.fromEntries([...terms].sort(([a], [b]) => Number(a) - Number(b)));
await fs.writeFile(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`keyword terms: ${terms.size} → ${path.relative(process.cwd(), OUT)}`);
