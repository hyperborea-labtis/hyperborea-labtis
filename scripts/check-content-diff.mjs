#!/usr/bin/env node
/**
 * Pull-request gate for content edits (Sveltia opens one PR per save).
 *
 *   node scripts/check-content-diff.mjs --base=origin/main      # compares src/content against that commit
 *
 * For every added or modified src/content/**\/*.md it applies src/lib/content-diff.ts (with tests): losing a
 * field that keeps URLs alive, changing a slug without an alias, pasted base64 images and broken link
 * syntax fail; vanished or newly empty fields only warn. A deleted file warns: its address will answer 404
 * unless a redirect covers it. In CI the base is the pull request's base commit.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentChanges } from "../src/lib/content-diff.ts";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const base = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "origin/main";
const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const diff = git("diff", "--name-status", "--no-renames", base, "--", "src/content");
if (diff.status !== 0) {
  console.error(`check-content-diff: cannot diff against ${base}: ${diff.stderr.trim()}`);
  process.exit(2);
}

let errors = 0;
let warnings = 0;
let files = 0;
for (const line of diff.stdout.split("\n").filter(Boolean)) {
  const [status, file] = line.split("\t");
  if (!file.endsWith(".md")) continue;
  if (status === "D") {
    warnings++;
    console.log(`⚠️  ${file}: file deleted — its address will answer 404 unless a redirect covers it`);
    continue;
  }
  files++;
  const before = status === "A" ? null : git("show", `${base}:${file}`).stdout;
  const { errors: e, warnings: w } = contentChanges(before, fs.readFileSync(path.join(ROOT, file), "utf8"));
  for (const m of e) console.log(`❌ ${file}: ${m}`);
  for (const m of w) console.log(`⚠️  ${file}: ${m}`);
  errors += e.length;
  warnings += w.length;
}
console.log(`${errors ? "❌" : "✅"} content diff vs ${base}: ${files} file(s) changed, ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
