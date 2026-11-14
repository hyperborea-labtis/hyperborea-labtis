#!/usr/bin/env node
/**
 * Shrink oversized raster images in public/sites/default/files IN PLACE, keeping each file's
 * path and format (so no content reference changes).
 *
 *   node scripts/optimize-images.mjs --dry   # report savings, write nothing
 *   node scripts/optimize-images.mjs         # apply
 *
 * Rules (idempotent — a second run changes nothing):
 *  - width > MAX_WIDTH            → resize down to MAX_WIDTH (2× the 1140px column)
 *  - JPEG larger than JPEG_KB     → re-encode (mozjpeg, quality 82)
 *  - a result is written only if it is ≥ MIN_SAVING smaller than the original
 * GIF/SVG/PDF are never touched.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const UPLOADS = path.join(ROOT, "public", "sites", "default", "files");
const DRY = process.argv.includes("--dry");
const MAX_WIDTH = 1800;
const JPEG_KB = 800;
const MIN_SAVING = 0.1;

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";
let before = 0;
let after = 0;
let changed = 0;
let scanned = 0;
const biggest = [];

for await (const file of walk(UPLOADS)) {
  const ext = path.extname(file).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext)) continue;
  scanned++;
  const original = await fs.readFile(file);
  before += original.length;

  let result = original;
  try {
    const img = sharp(original, { failOn: "none" }).rotate();
    const meta = await sharp(original, { failOn: "none" }).metadata();
    const tooWide = (meta.width ?? 0) > MAX_WIDTH;
    const bigJpeg = ext !== ".png" && original.length > JPEG_KB * 1024;
    if (tooWide || bigJpeg) {
      const pipeline = tooWide ? img.resize({ width: MAX_WIDTH, withoutEnlargement: true }) : img;
      const out =
        ext === ".png"
          ? await pipeline.png({ compressionLevel: 9, effort: 10 }).toBuffer()
          : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      if (out.length <= original.length * (1 - MIN_SAVING)) result = out;
    }
  } catch (err) {
    console.warn(`  ! skipped ${path.relative(UPLOADS, file)}: ${err.message}`);
  }

  after += result.length;
  if (result !== original) {
    changed++;
    biggest.push([original.length - result.length, path.relative(UPLOADS, file), original.length, result.length]);
    if (!DRY) await fs.writeFile(file, result);
  }
}

biggest.sort((a, b) => b[0] - a[0]);
console.log(`${DRY ? "[dry run] " : ""}${scanned} raster images scanned, ${changed} ${DRY ? "would change" : "optimized"}`);
console.log(`Images total: ${mb(before)} → ${mb(after)}  (saves ${mb(before - after)}, ${(((before - after) / before) * 100).toFixed(0)}%)`);
for (const [, name, o, n] of biggest.slice(0, 6)) console.log(`  ${mb(o).padStart(8)} → ${mb(n).padStart(8)}  ${name}`);
