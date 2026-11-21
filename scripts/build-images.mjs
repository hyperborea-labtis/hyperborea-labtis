#!/usr/bin/env node
/**
 * Pre-build step: responsive WebP variants of the featured images (src/lib/images.ts has the rules).
 *
 * Reads every `heroImage` (cards and article header: kinds `card` and `hero`) and every image used inside the
 * texts (kind `hero` only: original aspect) from src/content, writes public/_img/<name>-<kind><width>-<hash>.webp
 * and the manifest src/data/image-manifest.json that the components and the Markdown plugin read. GIFs only
 * get their real size in the manifest (they may be animated). Originals are never touched. Output is
 * keyed by a hash of the original's bytes: unchanged images are skipped, and files nobody references any
 * more are deleted, so a run after a CMS edit only encodes what changed. Both outputs are generated
 * (git-ignored); `npm run build` and `npm run dev` run this first.
 *
 *   node scripts/build-images.mjs          # incremental
 *   node scripts/build-images.mjs --force  # re-encode everything
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import YAML from "yaml";
import { planVariants, variantFileName, manifestKey } from "../src/lib/images.ts";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const CONTENT = path.join(ROOT, "src", "content");
const PUBLIC = path.join(ROOT, "public");
const OUT = path.join(PUBLIC, "_img");
const MANIFEST = path.join(ROOT, "src", "data", "image-manifest.json");
const FORCE = process.argv.includes("--force");
const QUALITY = 72;
/** An inline image of at most this many bytes is served as it is. */
const SMALL = 100 * 1024;
const started = Date.now();

function* markdownFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* markdownFiles(p);
    else if (e.name.endsWith(".md")) yield p;
  }
}

/** @type {Map<string, { featured: boolean }>} decoded path -> how it is used */
const sources = new Map();
const INLINE = /\/sites\/default\/files\/[^\s"'()<>\]]+?\.(?:jpe?g|png|webp|gif)(?=[\s"'()<>\]?#]|$)/gi;
for (const file of markdownFiles(CONTENT)) {
  const text = fs.readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const hero = m && YAML.parse(m[1])?.heroImage;
  if (typeof hero === "string" && hero.startsWith("/sites/")) sources.set(manifestKey(hero), { featured: true });
  for (const url of (m ? m[2] : text).match(INLINE) ?? []) {
    const key = manifestKey(url);
    if (!sources.has(key)) sources.set(key, { featured: false });
  }
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
const keep = new Set();
const missing = [];
let encoded = 0;
let reused = 0;

async function process_([source, { featured }]) {
  const abs = path.join(PUBLIC, source);
  if (!fs.existsSync(abs)) return missing.push(source);
  const bytes = fs.readFileSync(abs);
  const hash = crypto.createHash("sha1").update(bytes).digest("hex");
  const meta = await sharp(bytes).metadata();
  // EXIF orientation 5-8 swaps the sides: the browser shows the rotated picture.
  const swap = (meta.orientation ?? 1) >= 5;
  const original = { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height };
  const entry = { ...original };
  // GIFs may be animated, and an inline picture that is already small gains little from variants: those
  // keep their file and only get their real size in the manifest.
  const asIs = /\.gif$/i.test(source) || (!featured && bytes.length <= SMALL);
  for (const kind of asIs ? [] : featured ? ["card", "hero"] : ["hero"]) {
    entry[kind] = [];
    for (const size of planVariants(original, kind)) {
      const file = variantFileName(source, kind, size.width, hash);
      keep.add(file);
      const target = path.join(OUT, file);
      if (FORCE || !fs.existsSync(target)) {
        const img = sharp(bytes).rotate();
        const fit = kind === "card" ? { width: size.width, height: size.height, fit: "cover", position: "centre" } : { width: size.width };
        await img.resize(fit).webp({ quality: QUALITY, effort: 4 }).toFile(target);
        encoded++;
      } else reused++;
      entry[kind].push({ file, width: size.width, height: size.height });
    }
  }
  manifest[source] = entry;
}

const queue = [...sources].sort(([a], [b]) => a.localeCompare(b));
await Promise.all(Array.from({ length: 6 }, async () => { for (let s; (s = queue.shift()); ) await process_(s); }));

let removed = 0;
for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) { fs.rmSync(path.join(OUT, f)); removed++; }
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n");

const mb = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) / 1e6;
console.log(`build-images: ${Object.keys(manifest).length} images, ${encoded} encoded, ${reused} reused, ${removed} removed, ${mb.toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (missing.length) console.warn(`build-images: ${missing.length} heroImage file(s) not found: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
