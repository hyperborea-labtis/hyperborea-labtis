// Rewrites links to this site in src/content/**/*.md from absolute to relative
// ("https://www.hyperborea-labtis.org/es/paper/x" → "/es/paper/x"). Rules live in
// src/lib/own-links.ts. `npm run verify` fails while any absolute link is left;
// this is the fix. Run it after pasting links in the CMS.
//
//   node scripts/relativize-links.mjs          rewrite the files
//   node scripts/relativize-links.mjs --check  only report (exit 1 if any)
import fs from "node:fs";
import path from "node:path";
import { findOwnLinks, relativizeOwnLinks } from "../src/lib/own-links.ts";

const check = process.argv.includes("--check");
const root = path.join(import.meta.dirname, "..", "src", "content");

/** @param {string} dir @returns {string[]} */
function mdFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? mdFiles(p) : p.endsWith(".md") ? [p] : [];
  });
}

let files = 0;
let links = 0;
for (const file of mdFiles(root)) {
  const text = fs.readFileSync(file, "utf8");
  const n = findOwnLinks(text).length;
  if (!n) continue;
  files++;
  links += n;
  if (check) console.log(`${path.relative(process.cwd(), file)}: ${n}`);
  else fs.writeFileSync(file, relativizeOwnLinks(text));
}
console.log(`${check ? "found" : "rewrote"} ${links} link(s) in ${files} file(s)`);
process.exit(check && links ? 1 : 0);
