#!/usr/bin/env node
/**
 * Repeatable verification routine for the Hyperborea Astro site.
 *
 *   npm run verify                 # everything (build + check + counts vs Drupal)
 *   npm run verify -- --offline    # skip the Drupal JSON:API count comparison
 *   npm run verify -- --skip-build # reuse the existing dist/ (faster)
 *
 * Exit code 1 if any check FAILS. Warnings never fail the run.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const CONTENT = path.join(ROOT, "src", "content");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const ORIGIN = "https://hyperborea-labtis.org";
const LOCALES = ["es", "en", "fr"];
const COLLECTIONS = { papers: "paper", articles: "article", pages: "page" };

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has("--offline");
const SKIP_BUILD = args.has("--skip-build");

const results = [];
function record(name, status, detail = "", items = []) {
  results.push({ name, status, detail, items });
  const icon = status === "pass" ? "✅" : status === "warn" ? "⚠️ " : "❌";
  console.log(`${icon} ${name}${detail ? " — " + detail : ""}`);
  for (const it of items.slice(0, 8)) console.log(`     · ${it}`);
  if (items.length > 8) console.log(`     · … and ${items.length - 8} more`);
}

// ---------- helpers ----------
function walk(dir, filter = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

function readEntry(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { file, error: "no frontmatter" };
  try {
    return { file, data: YAML.parse(m[1]) ?? {}, body: m[2] };
  } catch (e) {
    return { file, error: "invalid YAML: " + e.message.split("\n")[0] };
  }
}

const entries = [];
for (const col of Object.keys(COLLECTIONS)) {
  for (const file of walk(path.join(CONTENT, col), (f) => f.endsWith(".md"))) {
    const rel = path.relative(path.join(CONTENT, col), file).split(path.sep);
    entries.push({ col, locale: rel[0], ...readEntry(file) });
  }
}
const relf = (f) => path.relative(ROOT, f);

// ---------- 1. build + type check ----------
function run(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", shell: false });
}
if (SKIP_BUILD && fs.existsSync(DIST)) {
  record("1. Build + astro check", "warn", "skipped (--skip-build); reusing existing dist/");
} else {
  const check = run("npx", ["astro", "check"]);
  const checkOut = (check.stdout || "") + (check.stderr || "");
  const errMatch = checkOut.match(/- (\d+) errors?/);
  const errs = errMatch ? Number(errMatch[1]) : check.status === 0 ? 0 : -1;
  const build = run("npm", ["run", "build"]); // astro build + pagefind index
  const buildOut = (build.stdout || "") + (build.stderr || "");
  const pages = (buildOut.match(/(\d+) page\(s\) built/) || [])[1];
  if (build.status !== 0 || errs !== 0) {
    record("1. Build + astro check", "fail", `build exit=${build.status}, check errors=${errs}`, buildOut.split("\n").filter((l) => /error/i.test(l)).slice(0, 5));
  } else {
    record("1. Build + astro check", "pass", `${pages ?? "?"} pages built, 0 type errors`);
  }
}

// ---------- 2. counts vs Drupal JSON:API ----------
async function countRemote(type, lang) {
  let url = `${ORIGIN}/${lang}/jsonapi/node/${type}?fields%5Bnode--${type}%5D=langcode&page%5Blimit%5D=20`;
  let n = 0;
  let guard = 0;
  while (url && guard++ < 100) {
    const res = await fetch(url, { headers: { Accept: "application/vnd.api+json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    n += d.data.filter((x) => x.attributes.langcode === lang).length;
    url = d.links?.next?.href ?? null;
  }
  return n;
}
if (OFFLINE) {
  record("2. Counts vs Drupal", "warn", "skipped (--offline)");
} else {
  const diffs = [];
  let compared = 0;
  try {
    for (const [col, type] of Object.entries(COLLECTIONS)) {
      for (const lang of LOCALES) {
        const remote = await countRemote(type, lang);
        const local = entries.filter((e) => e.col === col && e.locale === lang).length;
        compared += remote;
        if (remote !== local) diffs.push(`${col}/${lang}: Drupal=${remote} local=${local}`);
      }
    }
    record("2. Counts vs Drupal", diffs.length ? "fail" : "pass", diffs.length ? "mismatch" : `${compared} nodes match across all collections/locales`, diffs);
  } catch (e) {
    record("2. Counts vs Drupal", "warn", "could not reach Drupal: " + e.message);
  }
}

// ---------- 3. asset integrity ----------
{
  const missing = [];
  let checked = 0;
  const exists = (p) => fs.existsSync(path.join(PUBLIC, decodeURIComponent(p.split("?")[0])));
  for (const e of entries) {
    if (!e.data) continue;
    const refs = [];
    for (const k of ["heroImage", "pdf"]) if (e.data[k]) refs.push(e.data[k]);
    for (const m of e.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) refs.push(m[1]);
    for (const m of e.body.matchAll(/<img[^>]+src="([^"]+)"/g)) refs.push(m[1]);
    for (const ref of refs) {
      if (!ref.startsWith("/")) continue; // external
      checked++;
      if (!ref.startsWith("/sites/default/files/")) missing.push(`${relf(e.file)} → ${ref} (not under /sites/default/files/, the path the old site uses)`);
      else if (!exists(ref)) missing.push(`${relf(e.file)} → ${ref}`);
    }
  }
  record("3. Asset integrity", missing.length ? "fail" : "pass", `${checked} local references checked, ${missing.length} missing`, missing);
}

// ---------- 4. frontmatter & slugs ----------
{
  const problems = [];
  const seen = new Map();
  for (const e of entries) {
    if (e.error) { problems.push(`${relf(e.file)}: ${e.error}`); continue; }
    for (const f of ["slug", "title"]) {
      if (!e.data[f]) problems.push(`${relf(e.file)}: missing "${f}"`);
    }
    const base = path.basename(e.file, ".md");
    if (e.data.slug && e.data.slug !== base) problems.push(`${relf(e.file)}: slug "${e.data.slug}" ≠ filename "${base}"`);
    if (e.data.lang && e.data.lang !== e.locale) problems.push(`${relf(e.file)}: lang "${e.data.lang}" ≠ folder "${e.locale}"`);
    const key = `${e.col}/${e.locale}/${e.data.slug}`;
    if (seen.has(key)) problems.push(`duplicate slug: ${key}`);
    seen.set(key, true);
  }
  // sections must be one of the known term pages; aliases must be absolute paths
  const navSrc = fs.readFileSync(path.join(ROOT, "src", "data", "nav.ts"), "utf8");
  const knownSections = new Set([...navSrc.matchAll(/\{ label: "([^"]+)", path: "[^"]+" \}/g)].map((m) => m[1]));
  knownSections.add("Afinidades electivas");
  for (const e of entries) {
    if (!e.data) continue;
    if (e.data.section && !knownSections.has(e.data.section)) problems.push(`${relf(e.file)}: unknown section "${e.data.section}"`);
    for (const a of e.data.aliases ?? []) if (typeof a !== "string" || !a.startsWith("/")) problems.push(`${relf(e.file)}: alias "${a}" must start with "/"`);
    if (e.data.slug && !/^[a-z0-9_-]+$/.test(e.data.slug)) problems.push(`${relf(e.file)}: slug "${e.data.slug}" has characters outside [a-z0-9_-]`);
  }
  // every paper should belong to a published issue (page /numero-N must exist)
  const issueSrc = fs.readFileSync(path.join(ROOT, "src", "data", "issues.ts"), "utf8");
  const knownIssues = new Set([...issueSrc.matchAll(/^\s*(\d+):\s*\d{4}/gm)].map((m) => Number(m[1])));
  const noIssue = entries.filter((e) => e.col === "papers" && e.data && !e.data.issue).map((e) => `paper without "issue": ${relf(e.file)}`);
  const badIssue = entries.filter((e) => e.col === "papers" && e.data?.issue && !knownIssues.has(e.data.issue)).map((e) => `${relf(e.file)}: issue ${e.data.issue} is not in src/data/issues.ts (no /numero-${e.data.issue} page)`);
  if (badIssue.length) record("4c. Issue links", "fail", "paper points to an unknown issue", badIssue);
  else if (noIssue.length) record("4c. Issue links", "warn", `${noIssue.length} paper(s) not assigned to an issue`, noIssue);
  else record("4c. Issue links", "pass", `all papers belong to one of ${knownIssues.size} known issues`);
  // Drupal demo/template pages that should not ship
  const demos = entries.filter((e) => e.col === "pages" && ["typography", "welcome-hyperborea"].includes(e.data?.slug)).map((e) => `template demo page still present: ${relf(e.file)}`);
  record("4. Frontmatter & slugs", problems.length ? "fail" : "pass", `${entries.length} entries parsed, ${problems.length} problems`, problems);
  if (demos.length) record("4b. Template demo pages", "warn", `${demos.length} demo page(s) from the Drupal theme`, demos);
}

// ---------- 5. i18n ----------
{
  const problems = [];
  for (const l of LOCALES) {
    const home = path.join(DIST, `${l}.html`);
    if (!fs.existsSync(home)) { problems.push(`missing dist/${l}.html`); continue; }
    const html = fs.readFileSync(home, "utf8");
    if (!new RegExp(`<html[^>]*lang="${l}"`).test(html)) problems.push(`/${l}/ has wrong <html lang>`);
    for (const alt of [...LOCALES, "x-default"]) {
      if (!html.includes(`hreflang="${alt}"`)) problems.push(`/${l}/ missing hreflang="${alt}"`);
    }
  }
  // every content entry must have a built page in its own locale
  const routeFor = { papers: "paper", articles: "actividad", pages: "" };
  let built = 0;
  for (const e of entries) {
    if (!e.data || e.data.draft) continue;
    const seg = routeFor[e.col];
    const p = path.join(DIST, e.locale, seg, `${e.data.slug}.html`);
    if (fs.existsSync(p)) built++;
    else problems.push(`no built page for ${e.col}/${e.locale}/${e.data.slug}`);
  }
  record("5. i18n", problems.length ? "fail" : "pass", `3 homes OK, ${built}/${entries.length} entries have a built page`, problems);
  const esOnly = entries.filter((e) => e.col !== "pages" && e.locale === "es").length;
  const translated = entries.filter((e) => e.col !== "pages" && e.locale !== "es").length;
  record("5b. Translation coverage", "warn", `${translated} papers/activities translated vs ${esOnly} in ES — EN/FR fall back to ES content`);
}

// ---------- 6. internal links ----------
{
  const broken = new Map();
  let total = 0;
  const pages = walk(DIST, (f) => f.endsWith(".html"));
  const resolves = (p) => {
    const clean = decodeURIComponent(p.split("#")[0].split("?")[0]);
    const c = [path.join(DIST, clean), path.join(DIST, clean, "index.html"), path.join(DIST, clean + ".html")];
    return c.some((x) => fs.existsSync(x) && fs.statSync(x).isFile());
  };
  for (const f of pages) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const href = m[1];
      if (href.startsWith("//") || href.startsWith("/_astro")) continue;
      total++;
      if (href.length > 1 && href.split(/[?#]/)[0].endsWith("/")) {
        const k = href.split("#")[0];
        if (!broken.has(k)) broken.set(k, relf(f).replace("dist/", "/") + " — trailing slash, the site's URLs have none");
        continue;
      }
      if (!resolves(href)) {
        const k = href.split("#")[0];
        if (!broken.has(k)) broken.set(k, relf(f).replace("dist/", "/"));
      }
    }
  }
  const items = [...broken].map(([h, from]) => `${h}  (first seen in ${from.replace(/ — .*/, "")})${from.includes(" — ") ? " —" + from.split(" —")[1] : ""}`);
  record("6. Internal links/assets in dist", items.length ? "fail" : "pass", `${total} references in ${pages.length} pages, ${items.length} distinct broken`, items);
}

// ---------- 7. CMS config ----------
{
  const problems = [];
  try {
    const cfg = YAML.parse(fs.readFileSync(path.join(PUBLIC, "admin", "config.yml"), "utf8"));
    const astroCfg = fs.readFileSync(path.join(ROOT, "astro.config.mjs"), "utf8");
    const astroLocales = (astroCfg.match(/locales:\s*\[([^\]]*)\]/) || [])[1]?.replace(/["'\s]/g, "").split(",") ?? [];
    if (JSON.stringify(cfg.i18n?.locales) !== JSON.stringify(astroLocales)) problems.push(`locales differ: CMS=${JSON.stringify(cfg.i18n?.locales)} astro=${JSON.stringify(astroLocales)}`);
    for (const c of cfg.collections ?? []) {
      if (!fs.existsSync(path.join(ROOT, c.folder))) problems.push(`collection "${c.name}": folder ${c.folder} missing`);
    }
    const names = (cfg.collections ?? []).map((c) => c.name).sort().join(",");
    if (names !== Object.keys(COLLECTIONS).sort().join(",")) problems.push(`CMS collections (${names}) ≠ content collections`);
    // every schema field the CMS edits must exist in real frontmatter (sample check)
    for (const c of cfg.collections ?? []) {
      const sample = entries.find((e) => e.col === c.name && e.data);
      if (!sample) continue;
      const cmsFields = new Set(c.fields.map((f) => f.name));
      for (const k of Object.keys(sample.data)) {
        if (k !== "lang" && !cmsFields.has(k)) problems.push(`"${c.name}": frontmatter field "${k}" not editable in CMS`);
      }
    }
    if (String(cfg.backend?.repo).includes("YOUR_GITHUB_USER")) problems.push("backend.repo is still a placeholder");
    if (cfg.media_folder !== "public/sites/default/files" || cfg.public_folder !== "/sites/default/files") problems.push("media_folder/public_folder must be public/sites/default/files and /sites/default/files (old site's file URLs)");
    record("7. CMS config", problems.length ? "fail" : "pass", `${(cfg.collections ?? []).length} collections, repo ${cfg.backend?.repo}`, problems);
  } catch (e) {
    record("7. CMS config", "fail", "cannot read/parse config.yml: " + e.message);
  }
}

// ---------- 8. search index ----------
{
  const entry = path.join(DIST, "pagefind", "pagefind-entry.json");
  if (!fs.existsSync(entry)) {
    record("8. Search index (Pagefind)", "fail", "dist/pagefind missing — run `npm run build` (not `astro build`)");
  } else {
    const langs = JSON.parse(fs.readFileSync(entry, "utf8")).languages ?? {};
    const missing = LOCALES.filter((l) => !langs[l]);
    const pages = Object.values(langs).reduce((n, l) => n + (l.page_count ?? 0), 0);
    record("8. Search index (Pagefind)", missing.length ? "fail" : "pass", missing.length ? `no index for: ${missing.join(", ")}` : `${pages} pages indexed across ${Object.keys(langs).length} languages`);
  }
}

// ---------- 9. URL parity with the old site ----------
// scripts/legacy-urls.txt is a frozen capture of the old Drupal site's public
// URLs (sitemap + menu links; see scripts/capture-legacy-urls.mjs). Every one of
// them must still answer here: a real page or a redirect.
{
  const manifest = path.join(ROOT, "scripts", "legacy-urls.txt");
  if (!fs.existsSync(manifest)) {
    record("9. URL parity with old site", "fail", "scripts/legacy-urls.txt missing — run scripts/capture-legacy-urls.mjs");
  } else {
    const urls = fs.readFileSync(manifest, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
    const missing = urls.filter((u) => {
      const clean = decodeURIComponent(u);
      return !(isFile(path.join(DIST, clean)) || isFile(path.join(DIST, clean + ".html")) || isFile(path.join(DIST, clean, "index.html")));
    });
    const redirects = path.join(DIST, "_redirects");
    const lines = fs.existsSync(redirects) ? fs.readFileSync(redirects, "utf8").split("\n").filter(Boolean).length : 0;
    const items = [...missing];
    if (!lines) items.push("dist/_redirects missing or empty (real 301s on Cloudflare)");
    if (lines > 2000) items.push(`_redirects has ${lines} lines; Cloudflare Pages allows 2000`);
    record("9. URL parity with old site", items.length ? "fail" : "pass", `${urls.length - missing.length}/${urls.length} old URLs answer; ${lines} lines in _redirects`, items);
  }
}

// ---------- summary ----------
const fails = results.filter((r) => r.status === "fail").length;
const warns = results.filter((r) => r.status === "warn").length;
console.log(`\n${fails ? "❌" : "✅"} ${results.length - fails - warns} passed, ${warns} warnings, ${fails} failed`);
process.exit(fails ? 1 : 0);
