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
import { findOwnLinks } from "../src/lib/own-links.ts";

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
// Existence check by EXACT name. macOS (APFS) matches file names regardless of case and of
// Unicode normalization (NFC "í" vs NFD "i"+U+0301); Linux and Cloudflare do not, so a
// reference that works on a Mac can 404 in production. Compare directory entries byte for byte.
const dirCache = new Map();
function existsExact(abs) {
  let cur = path.sep;
  for (const part of path.resolve(abs).split(path.sep).filter(Boolean)) {
    let names = dirCache.get(cur);
    if (!names) {
      try { names = new Set(fs.readdirSync(cur)); } catch { return false; }
      dirCache.set(cur, names);
    }
    if (!names.has(part)) return false;
    cur = path.join(cur, part);
  }
  return true;
}
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
// Nodes deliberately not migrated (Drupal theme demo page and front-page node);
// their URLs redirect to the home page — keep in sync with SKIP_NIDS in
// import-drupal.mjs.
const SKIPPED_NIDS = new Set([7, 45]);
async function countRemote(type, lang) {
  let url = `${ORIGIN}/${lang}/jsonapi/node/${type}?fields%5Bnode--${type}%5D=langcode,drupal_internal__nid&page%5Blimit%5D=20`;
  let n = 0;
  let guard = 0;
  while (url && guard++ < 100) {
    const res = await fetch(url, { headers: { Accept: "application/vnd.api+json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    n += d.data.filter((x) => x.attributes.langcode === lang && !SKIPPED_NIDS.has(x.attributes.drupal_internal__nid)).length;
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
  const exists = (p) => existsExact(path.join(PUBLIC, decodeURIComponent(p.split("?")[0])));
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
    return c.some((x) => existsExact(x) && fs.statSync(x).isFile());
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

  // 6b. #fragment links inside a page (footnotes, ToC) must have a matching id/name.
  const dangling = [];
  let fragTotal = 0;
  for (const f of pages) {
    const html = fs.readFileSync(f, "utf8");
    const targets = new Set([...html.matchAll(/\b(?:id|name)="([^"]*)"/g)].map((m) => m[1]));
    const missing = new Set();
    for (const m of html.matchAll(/<a\b[^>]*?\bhref="#([^"]+)"/g)) {
      fragTotal++;
      let frag = m[1];
      try { frag = decodeURIComponent(frag); } catch { /* keep raw */ }
      if (!targets.has(frag) && !targets.has(m[1])) missing.add(m[1]);
    }
    if (missing.size) dangling.push(`${relf(f).replace("dist/", "/")}  →  ${[...missing].map((x) => "#" + x).join(" ")}`);
  }
  record("6b. In-page anchors (#fragment) in dist", dangling.length ? "warn" : "pass", `${fragTotal} #links, ${dangling.length} pages with a missing target`, dangling);

  // 6c. Nothing executable may come from the content: only Astro's own module scripts
  // (the CSP hashes them), no event-handler attributes, no javascript:/data: links, no
  // iframe/object/embed. Also catches links whose URL starts with an encoded space
  // (`href="%20https://…"`, from `[x](< https://…>)` in Markdown): they never work.
  // 6d. Every real page carries the CSP <meta> (redirect stubs are exempt).
  // Standalone pages outside BaseLayout, reviewed by hand: /admin (its own CSP lives in
  // public/_headers; the CMS script is pinned with SRI) and the legacy search redirect
  // (/{lang}/search/node: a fixed inline script that only reads ?keys=).
  const EXEMPT = /^\/(admin\/index|(es|en|fr)\/search\/node)\.html$/;
  const unsafe = [];
  const noCsp = [];
  for (const f of pages) {
    const html = fs.readFileSync(f, "utf8");
    const rel = relf(f).replace("dist/", "/");
    if (EXEMPT.test(rel)) continue;
    const issues = new Set();
    for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
      const attrs = m[1];
      const isModule = /\btype="module"/.test(attrs);
      const src = /\bsrc="([^"]*)"/.exec(attrs)?.[1];
      const turnstile = src === "https://challenges.cloudflare.com/turnstile/v0/api.js"; // contact form widget
      const jsonLd = /\btype="application\/ld\+json"/.test(attrs) && !src; // data, not code (parsed in check 12)
      if (!turnstile && !jsonLd && (!isModule || (src && !src.startsWith("/_astro/")))) issues.add(`<script${attrs.slice(0, 50)}>`);
    }
    for (const m of html.matchAll(/<(?!\/)[a-z][^>]*?\son[a-z]+\s*=/gi)) issues.add(`event handler in ${m[0].slice(0, 50)}`);
    for (const m of html.matchAll(/\b(?:href|src|action|formaction)\s*=\s*"\s*(?:javascript|vbscript|data:text)[^"]{0,30}/gi)) issues.add(m[0].slice(0, 60));
    for (const m of html.matchAll(/<(?:iframe|object|embed|applet)\b/gi)) issues.add(m[0]);
    for (const m of html.matchAll(/\bhref="(?:%20|\s)[^"]{0,40}/g)) issues.add(`link with leading space: ${m[0].slice(0, 60)}`);
    if (issues.size) unsafe.push(`${rel}  →  ${[...issues].slice(0, 3).join(" · ")}`);
    const stub = /http-equiv="refresh"/i.test(html) && html.length < 2000;
    if (!stub && !/http-equiv="content-security-policy"/i.test(html)) noCsp.push(rel);
  }
  record("6c. No unsafe HTML or broken-link patterns in dist", unsafe.length ? "fail" : "pass", `${pages.length} pages scanned, ${unsafe.length} with issues`, unsafe);
  record("6d. CSP <meta> on every page", noCsp.length ? "fail" : "pass", `${noCsp.length} pages without it`, noCsp);
}

// ---------- 7. CMS config ----------
{
  const problems = [];
  try {
    const cfg = YAML.parse(fs.readFileSync(path.join(PUBLIC, "admin", "config.yml"), "utf8"));
    const astroCfg = fs.readFileSync(path.join(ROOT, "astro.config.mjs"), "utf8");
    const astroLocales = (astroCfg.match(/locales:\s*\[([^\]]*)\]/) || [])[1]?.replace(/["'\s]/g, "").split(",") ?? [];
    if (JSON.stringify(cfg.i18n?.locales) !== JSON.stringify(astroLocales)) problems.push(`locales differ: CMS=${JSON.stringify(cfg.i18n?.locales)} astro=${JSON.stringify(astroLocales)}`);
    const folderCols = (cfg.collections ?? []).filter((c) => c.folder);
    for (const c of folderCols) {
      if (!fs.existsSync(path.join(ROOT, c.folder))) problems.push(`collection "${c.name}": folder ${c.folder} missing`);
    }
    // "vocabulary" is a data collection (keyword terms), not a content collection.
    const names = folderCols.map((c) => c.name).filter((n) => n !== "vocabulary").sort().join(",");
    if (names !== Object.keys(COLLECTIONS).sort().join(",")) problems.push(`CMS collections (${names}) ≠ content collections`);
    // every schema field the CMS edits must exist in real frontmatter (sample check)
    for (const c of folderCols) {
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
    // The search page filters by tipo / seccion / numero (data-pagefind-filter in the templates).
    const filterFiles = fs.existsSync(path.join(DIST, "pagefind", "filter")) ? fs.readdirSync(path.join(DIST, "pagefind", "filter")).length : 0;
    record("8b. Search filters", filterFiles >= LOCALES.length ? "pass" : "fail", `${filterFiles} filter index files (expected at least one per language)`);
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

// ---------- 9b. keyword pages (/{lang}/taxonomy/term/<id>) + vocabulary ----------
{
  const termsDir = path.join(ROOT, "src", "data", "keywords");
  const terms = fs.existsSync(termsDir)
    ? fs.readdirSync(termsDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(termsDir, f), "utf8")))
    : [];
  // Same rule as termId() in src/lib/keywords.ts: old Drupal id, else a slug of the name.
  const slug = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const ids = terms.filter((t) => t.name?.trim()).flatMap((t) => [t.tid ? String(t.tid) : slug(t.name), ...(t.alsoTids ?? []).map(String)]);
  const missing = [];
  for (const lang of LOCALES) {
    for (const id of ids) {
      if (!fs.existsSync(path.join(DIST, lang, "taxonomy", "term", `${id}.html`))) missing.push(`/${lang}/taxonomy/term/${id}`);
    }
  }
  record(
    "9b. Keyword pages",
    ids.length && !missing.length ? "pass" : "fail",
    ids.length ? `${ids.length} terms × ${LOCALES.length} languages, ${missing.length} missing` : "src/data/keywords/ missing or empty",
    missing.slice(0, 10),
  );

  // The CMS menu only offers vocabulary terms: every paper keyword must be one.
  const known = new Set(terms.map((t) => t.name?.trim()));
  const unknown = [];
  for (const e of entries) {
    if (e.col !== "papers" || !e.data) continue;
    const kws = e.data.keywords ?? [];
    for (const k of kws) if (!known.has(k)) unknown.push(`${relf(e.file)}: "${k}"`);
    // the CMS menu breaks (Svelte each_key_duplicate) when a paper repeats a keyword
    for (const k of new Set(kws.filter((k, i) => kws.indexOf(k) !== i))) unknown.push(`${relf(e.file)}: "${k}" repeated`);
  }
  record(
    "9c. Paper keywords in vocabulary",
    unknown.length ? "fail" : "pass",
    unknown.length ? `${unknown.length} keyword problems (not in src/data/keywords/, or repeated in one paper)` : "all paper keywords exist in the vocabulary",
    unknown,
  );
}

// ---------- 10. SEO head: canonical, robots, hreflang, sitemap ----------
{
  const read = (f) => fs.readFileSync(f, "utf8");
  const robotsTxt = fs.existsSync(path.join(DIST, "robots.txt")) ? read(path.join(DIST, "robots.txt")) : "";
  const indexable = /^Allow:\s*\//m.test(robotsTxt);
  const sitemapFile = path.join(DIST, "sitemap-0.xml");
  const sitemapUrls = fs.existsSync(sitemapFile) ? [...read(sitemapFile).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
  const origin = sitemapUrls.length ? new URL(sitemapUrls[0]).origin : "";

  const decode = (t) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  /** @type {Map<string, { robots: string | undefined, canonicals: string[], scholar: string[][], ld: string[], title: string, description: string, hreflang: Map<string, string> }>} */
  const info = new Map();
  for (const f of walk(DIST, (x) => x.endsWith(".html"))) {
    const rel = "/" + path.relative(DIST, f).split(path.sep).join("/");
    // the three homes are dist/es.html, dist/en.html and dist/fr.html (build.format "file")
    if (!/^\/(es|en|fr)(\/|\.html$)/.test(rel) || /^\/(es|en|fr)\/search\/node\.html$/.test(rel)) continue;
    const html = read(f);
    if (/http-equiv="refresh"/i.test(html) && html.length < 2000) continue; // redirect stub
    info.set(rel.replace(/\.html$/, ""), {
      robots: /<meta name="robots" content="([^"]*)"/.exec(html)?.[1],
      canonicals: [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]),
      scholar: [...html.matchAll(/<meta name="(citation_[a-z_]+)" content="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]),
      ld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
      title: decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ""),
      description: decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? ""),
      hreflang: new Map([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]*)"/g)].map((m) => [m[1], m[2]])),
    });
  }

  const problems = [];
  const add = (msg) => problems.push(msg);

  // a. every page: one absolute canonical on the site's origin, and a robots meta that matches the build mode
  for (const [url, p] of info) {
    if (p.canonicals.length !== 1) add(`${url}: ${p.canonicals.length} canonical links (expected 1)`);
    else if (!p.canonicals[0].startsWith("https://") || new URL(p.canonicals[0]).origin !== origin) add(`${url}: canonical "${p.canonicals[0]}" is not absolute on ${origin}`);
    if (!p.robots) add(`${url}: no robots meta`);
    else if (indexable && /nofollow/.test(p.robots)) add(`${url}: noindex,nofollow in an indexable build`);
    else if (!indexable && !/noindex/.test(p.robots)) add(`${url}: indexable page in a non-indexable build`);
  }

  // b. untranslated copies (Spanish text under /en or /fr): canonical to /es and noindex; real translations stand alone
  const routeSeg = { papers: "paper", articles: "actividad", pages: "" };
  const has = new Set(entries.filter((e) => e.data && !e.data.draft).map((e) => `${e.col}|${e.locale}|${e.data.slug}`));
  for (const e of entries) {
    if (!e.data || e.data.draft || e.locale !== "es") continue;
    const seg = routeSeg[e.col] ? `/${routeSeg[e.col]}` : "";
    for (const L of ["en", "fr"]) {
      const url = `/${L}${seg}/${e.data.slug}`;
      const p = info.get(url);
      if (!p) continue;
      const real = has.has(`${e.col}|${L}|${e.data.slug}`);
      const self = `${origin}${url}`;
      const esUrl = `${origin}/es${seg}/${e.data.slug}`;
      if (real && p.canonicals[0] !== self) add(`${url}: translated page whose canonical is not itself`);
      if (!real && p.canonicals[0] !== esUrl) add(`${url}: untranslated copy must have canonical ${esUrl}`);
      if (!real && indexable && !/^noindex/.test(p.robots ?? "")) add(`${url}: untranslated copy must be noindex`);
      if (!real && p.hreflang.size) add(`${url}: untranslated copy must not list hreflang`);
    }
  }

  // c. hreflang: absolute, x-default present, every target is a built page that links back
  for (const [url, p] of info) {
    if (!p.hreflang.size) continue;
    if (!p.hreflang.has("x-default")) add(`${url}: hreflang without x-default`);
    for (const [lang, href] of p.hreflang) {
      if (!href.startsWith("https://")) { add(`${url}: hreflang ${lang} is not absolute (${href})`); continue; }
      const target = info.get(new URL(href).pathname);
      if (!target) add(`${url}: hreflang ${lang} → ${href} is not a built page`);
      else if (lang !== "x-default" && !target.hreflang.size) add(`${url}: hreflang ${lang} → ${new URL(href).pathname} lists no hreflang back`);
      else if (lang !== "x-default" && ![...target.hreflang.values()].includes(`${origin}${url}`)) add(`${url}: ${new URL(href).pathname} does not link back`);
    }
  }

  // d. the sitemap lists only pages that exist, are not untranslated copies and (in an indexable build) are not noindex
  for (const u of sitemapUrls) {
    const pth = new URL(u).pathname;
    const p = info.get(pth);
    if (!p) { add(`sitemap: ${pth} is not a built page`); continue; }
    if (p.canonicals[0] !== u) add(`sitemap: ${pth} is not its own canonical (${p.canonicals[0]})`);
    if (indexable && /noindex/.test(p.robots ?? "")) add(`sitemap: ${pth} is noindex`);
  }
  record("10. SEO head (canonical, robots, hreflang, sitemap)", problems.length ? "fail" : "pass", `${info.size} pages, ${sitemapUrls.length} sitemap URLs, ${problems.length} problems`, problems);
  // 11. Titles and descriptions: present, sized for search results, and not repeated between
  // pages that are their own canonical (an untranslated /en copy legitimately repeats /es).
  const meta = [];
  const dupTitle = new Map();
  const dupDesc = new Map();
  for (const [url, p] of info) {
    if (!p.title.trim()) meta.push(`${url}: empty <title>`);
    if (!p.description.trim()) meta.push(`${url}: no meta description`);
    else if (p.description.length < 40 || p.description.length > 170) meta.push(`${url}: description is ${p.description.length} characters (40–170)`);
    if (p.canonicals[0] !== `${origin}${url}`) continue; // not its own canonical
    const lang = url.split("/")[1].replace(".html", "");
    for (const [key, map] of [[p.title, dupTitle], [p.description, dupDesc]]) {
      const k = `${lang}|${key}`;
      map.set(k, [...(map.get(k) ?? []), url]);
    }
  }
  const dups = (map, what) => [...map.values()].filter((u) => u.length > 1).map((u) => `${what} repeated: ${u.slice(0, 3).join(" , ")}${u.length > 3 ? ` (+${u.length - 3})` : ""}`);
  meta.push(...dups(dupTitle, "title"), ...dups(dupDesc, "description"));
  record("11. Titles and meta descriptions", meta.length ? "fail" : "pass", `${info.size} pages, ${meta.length} problems`, meta);
  // 12. Scholarly metadata (Google Scholar citation_*) and JSON-LD. Only pages that are their own
  // canonical carry them; untranslated copies, duplicates and noindex pages carry none.
  const sch = [];
  const noAuthor = [];
  const ISO = /^\d{4}(-\d{2}-\d{2})?$/;
  const paperPdf = new Map(entries.filter((e) => e.col === "papers" && e.locale === "es" && e.data && !e.data.draft).map((e) => [e.data.slug, e.data]));
  for (const [url, p] of info) {
    const own = p.canonicals[0] === `${origin}${url}`;
    const tags = new Map();
    for (const [k, v] of p.scholar) tags.set(k, [...(tags.get(k) ?? []), v]);
    if (!own) {
      if (tags.size) sch.push(`${url}: a page that is not its own canonical carries citation_* tags`);
      if (p.ld.length) sch.push(`${url}: a page that is not its own canonical carries JSON-LD`);
      continue;
    }
    // JSON-LD: parses, has a graph, every @id reference resolves, breadcrumbs are well formed
    const nodes = [];
    for (const raw of p.ld) {
      let doc;
      try { doc = JSON.parse(raw); } catch { sch.push(`${url}: JSON-LD is not valid JSON`); continue; }
      if (doc["@context"] !== "https://schema.org" || !Array.isArray(doc["@graph"])) { sch.push(`${url}: JSON-LD without @context/@graph`); continue; }
      nodes.push(...doc["@graph"]);
    }
    const defined = new Set(nodes.map((n) => n["@id"]).filter(Boolean));
    const refs = (o) => (o && typeof o === "object" ? (Object.keys(o).length === 1 && o["@id"] ? [o["@id"]] : Object.values(o).flatMap(refs)) : []);
    for (const n of nodes) for (const r of refs(Object.fromEntries(Object.entries(n).filter(([k]) => k !== "@id")))) if (!defined.has(r)) sch.push(`${url}: JSON-LD references ${r} but never defines it`);
    for (const b of nodes.filter((n) => n["@type"] === "BreadcrumbList")) {
      const items = b.itemListElement ?? [];
      if (!items.length || items.some((it, i) => it.position !== i + 1)) sch.push(`${url}: breadcrumb positions are not 1..n`);
      for (const it of items.slice(0, -1)) if (!String(it.item ?? "").startsWith(`${origin}/`)) sch.push(`${url}: breadcrumb link "${it.item}" is not absolute on ${origin}`);
    }
    if (/^\/(es|en|fr)$/.test(url) && !nodes.some((n) => n["@type"] === "WebSite")) sch.push(`${url}: home without a WebSite node`);

    const paper = /^\/(es|en|fr)\/paper\/([^/]+)$/.exec(url);
    if (!paper) continue;
    const get = (k) => tags.get(k)?.[0];
    for (const k of ["citation_title", "citation_journal_title", "citation_issn", "citation_language", "citation_publisher", "citation_abstract_html_url"]) if (!get(k)) sch.push(`${url}: no ${k}`);
    if (get("citation_issn") && get("citation_issn") !== "2618-4397") sch.push(`${url}: citation_issn is ${get("citation_issn")}`);
    if (get("citation_abstract_html_url") && get("citation_abstract_html_url") !== p.canonicals[0]) sch.push(`${url}: citation_abstract_html_url is not the canonical`);
    if (!/^\d{4}(\/\d{2}\/\d{2})?$/.test(get("citation_publication_date") ?? "")) sch.push(`${url}: citation_publication_date "${get("citation_publication_date")}" is not YYYY or YYYY/MM/DD`);
    if (!/^\d+$/.test(get("citation_volume") ?? "")) sch.push(`${url}: citation_volume "${get("citation_volume")}" is not a number`);
    if (!tags.has("citation_author")) noAuthor.push(`${url}  ${get("citation_title")?.slice(0, 70)}`);
    const fm = paperPdf.get(paper[2]);
    if (fm?.pdf) {
      const pdf = get("citation_pdf_url") ?? "";
      if (!pdf.startsWith(`${origin}/`)) sch.push(`${url}: citation_pdf_url missing or not absolute (${pdf})`);
      else if (!existsExact(path.join(DIST, decodeURIComponent(new URL(pdf).pathname)))) sch.push(`${url}: citation_pdf_url ${pdf} does not exist in dist`);
    } else if (get("citation_pdf_url")) sch.push(`${url}: citation_pdf_url but the paper has no pdf`);
    const art = nodes.find((n) => n["@type"] === "ScholarlyArticle");
    if (!art) { sch.push(`${url}: no ScholarlyArticle in JSON-LD`); continue; }
    if (art.url !== p.canonicals[0]) sch.push(`${url}: ScholarlyArticle url is not the canonical`);
    if (!art.headline || !art.name) sch.push(`${url}: ScholarlyArticle without headline/name`);
    if (art.datePublished && !ISO.test(art.datePublished)) sch.push(`${url}: datePublished "${art.datePublished}" is not ISO`);
    if (!nodes.some((n) => n["@type"] === "BreadcrumbList")) sch.push(`${url}: paper without BreadcrumbList`);
  }
  record("12. Scholarly metadata and JSON-LD", sch.length ? "fail" : "pass", `${info.size} pages checked, ${sch.length} problems`, sch);
  record("12b. Papers without an author", noAuthor.length ? "warn" : "pass", noAuthor.length ? `${noAuthor.length} papers carry no citation_author: Google Scholar needs one to index them (set the \`author\` field)` : "every paper has an author", noAuthor);

  // ---------- 14. Sitemap lastmod ----------
  {
    const lm = [];
    const xml = fs.existsSync(sitemapFile) ? read(sitemapFile) : "";
    // @astrojs/sitemap writes the date as midnight UTC ("2025-11-28T00:00:00.000Z"): compare the day.
    const withDate = new Map([...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2]?.slice(0, 10)]));
    const dateOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? new Date(v).toISOString().slice(0, 10) : undefined);
    const expected = new Map();
    for (const e of entries) {
      if (e.locale !== "es" || !e.data || (e.col !== "papers" && e.col !== "articles")) continue;
      const d = dateOf(e.data.publishedDate || undefined) ?? dateOf(e.data.created || undefined);
      expected.set(`/${e.locale}/${e.col === "papers" ? "paper" : "actividad"}/${e.data.slug}`, d);
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const [u, d] of withDate) {
      const pth = new URL(u).pathname;
      if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today)) lm.push(`${pth}: lastmod "${d}" is not a past YYYY-MM-DD date`);
      if (expected.has(pth)) {
        if (d !== expected.get(pth)) lm.push(`${pth}: lastmod ${d ?? "missing"}, its frontmatter date is ${expected.get(pth) ?? "none"}`);
      } else if (d && !/^\/(es|en|fr)(\/numero-\d+)?$/.test(pth)) {
        lm.push(`${pth}: has a lastmod but no real date behind it`);
      }
    }
    for (const l of LOCALES) if (!withDate.get(`${origin}/${l}`)) lm.push(`/${l}: home without lastmod`);
    record("14. Sitemap lastmod", lm.length ? "fail" : "pass", `${withDate.size} URLs, ${[...withDate.values()].filter(Boolean).length} with lastmod, ${lm.length} problems`, lm);
  }

  // ---------- 15. RSS feeds ----------
  {
    const feedProblems = [];
    const titles = new Set();
    for (const l of LOCALES) {
      const f = path.join(DIST, l, "rss.xml");
      if (!fs.existsSync(f)) { feedProblems.push(`/${l}/rss.xml missing`); continue; }
      const xml = read(f);
      const feedUrl = `${origin}/${l}/rss.xml`;
      if (!xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')) feedProblems.push(`/${l}/rss.xml: no XML declaration`);
      if (!xml.includes(`<atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />`)) feedProblems.push(`/${l}/rss.xml: no atom:link rel=self to ${feedUrl}`);
      if (!new RegExp(`<language>${l}</language>`).test(xml)) feedProblems.push(`/${l}/rss.xml: <language> is not ${l}`);
      if (!/<lastBuildDate>[^<]+<\/lastBuildDate>/.test(xml)) feedProblems.push(`/${l}/rss.xml: no lastBuildDate`);
      titles.add(/<channel>\s*<title>([^<]*)<\/title>/.exec(xml)?.[1]);
      const items = xml.split("<item>").slice(1);
      if (!items.length) feedProblems.push(`/${l}/rss.xml: no items`);
      if ((xml.match(/<item>/g) ?? []).length !== (xml.match(/<\/item>/g) ?? []).length) feedProblems.push(`/${l}/rss.xml: unbalanced <item>`);
      for (const it of items) {
        const link = /<link>([^<]+)<\/link>/.exec(it)?.[1];
        const guid = /<guid isPermaLink="true">([^<]+)<\/guid>/.exec(it)?.[1];
        const page = link && info.get(new URL(link).pathname);
        if (!link || link !== guid) feedProblems.push(`/${l}/rss.xml: item link/guid mismatch (${link} vs ${guid})`);
        else if (!page) feedProblems.push(`/${l}/rss.xml: ${link} is not a built page`);
        else if (page.canonicals[0] !== link) feedProblems.push(`/${l}/rss.xml: ${link} is not its page's canonical (${page.canonicals[0]})`);
      }
    }
    if (titles.size !== LOCALES.length) feedProblems.push("feeds share a channel title: each language needs its own");
    record("15. RSS feeds", feedProblems.length ? "fail" : "pass", `${LOCALES.length} feeds, ${feedProblems.length} problems`, feedProblems);
  }

  // ---------- 16. 404 page ----------
  {
    const f = path.join(DIST, "404.html");
    const e = [];
    if (!fs.existsSync(f)) e.push("dist/404.html missing");
    else {
      const html = read(f);
      if (!/<meta name="robots" content="noindex/.test(html)) e.push("404 is not noindex");
      if (/<link rel="(canonical|alternate)" [^>]*hreflang|<link rel="canonical"/.test(html)) e.push("404 has a canonical or hreflang (it has no address of its own)");
      for (const l of LOCALES) if (!new RegExp(`<p lang="${l}"[^>]*>[^<]*<a href="/${l}"`).test(html)) e.push(`404 has no ${l} block with a link to /${l}`);
      if ((html.match(/<h1\b/g) ?? []).length !== 1) e.push("404 must have exactly one <h1>");
    }
    record("16. 404 page (neutral, three languages)", e.length ? "fail" : "pass", e.length ? `${e.length} problems` : "noindex, no canonical, es/en/fr blocks", e);
  }

  record(
    "10b. Indexing mode",
    indexable ? "pass" : "warn",
    indexable ? "indexable build (PUBLIC_INDEXABLE=true): robots.txt allows crawling" : "NOT indexable (default: dev/preview): every page is noindex and robots.txt disallows all. Production must set PUBLIC_INDEXABLE=true",
  );
}

// ---------- 13. Own-domain links in content ----------
{
  const bad = [];
  for (const file of walk(CONTENT, (f) => f.endsWith(".md"))) {
    for (const url of findOwnLinks(fs.readFileSync(file, "utf8"))) bad.push(`${relf(file)}: ${url}`);
  }
  record(
    "13. Own-domain links in content are relative",
    bad.length ? "fail" : "pass",
    bad.length ? `${bad.length} absolute link(s) to this site: run \`npm run fix:links\`` : "no link to hyperborea-labtis.org written as an absolute URL",
    bad,
  );
}

// ---------- summary ----------
const fails = results.filter((r) => r.status === "fail").length;
const warns = results.filter((r) => r.status === "warn").length;
console.log(`\n${fails ? "❌" : "✅"} ${results.length - fails - warns} passed, ${warns} warnings, ${fails} failed`);
process.exit(fails ? 1 : 0);
