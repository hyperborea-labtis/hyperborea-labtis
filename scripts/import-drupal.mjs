#!/usr/bin/env node
/**
 * Import content from the Hyperborea Drupal site (JSON:API) into Astro content
 * collections: Markdown files with structured frontmatter + localized assets.
 *
 * Usage:
 *   node scripts/import-drupal.mjs            # sample (LIMIT papers per lang)
 *   node scripts/import-drupal.mjs --all      # every paper + page, all langs
 *   LIMIT=12 node scripts/import-drupal.mjs
 *
 * Languages: es (default), en, fr. The Drupal node id (`drupal_internal__nid`)
 * is used as `translationKey` to link translations of the same paper/page.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ORIGIN = "https://hyperborea-labtis.org";
const LANGS = ["es", "en", "fr"];
const ALL = process.argv.includes("--all");
const LIMIT = ALL ? Infinity : Number(process.env.LIMIT || 8);

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const CONTENT = path.join(ROOT, "src", "content");
const PUBLIC = path.join(ROOT, "public");

// Template demo nodes of the Drupal theme: "Typography" (7) and the front-page
// node (45, the home is built from code). Their /node/N URLs are redirected to
// the home by src/data/legacy.ts instead of being imported as content.
const SKIP_NIDS = new Set([7, 45]);

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
td.use(gfm);

const assetCache = new Set();

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.api+json" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Download a Drupal file to the SAME path it has on the source site
 * (/sites/default/files/...), so every PDF/image URL — cited from Dialnet,
 * Latindex, Google Scholar… — keeps working after the migration. Returns the
 * public path exactly as Drupal serves it (percent-encoded, no query string).
 */
async function downloadAsset(fileUrl) {
  const url = new URL(fileUrl, ORIGIN);
  const publicPath = url.pathname;
  if (!publicPath.startsWith("/sites/default/files/")) {
    throw new Error(`unexpected asset path ${publicPath}`);
  }
  if (assetCache.has(publicPath)) return publicPath;
  const dest = path.join(PUBLIC, decodeURIComponent(publicPath));
  if (!dest.startsWith(path.join(PUBLIC, "sites") + path.sep)) {
    throw new Error(`asset path escapes public/sites: ${publicPath}`);
  }
  try {
    await fs.access(dest);
    assetCache.add(publicPath);
    return publicPath;
  } catch {
    /* not downloaded yet */
  }
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`asset HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  assetCache.add(publicPath);
  return publicPath;
}

function slugFromAlias(alias, title) {
  if (alias) return alias.split("/").filter(Boolean).pop();
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function indexIncluded(included = []) {
  const map = new Map();
  for (const item of included) map.set(`${item.type}:${item.id}`, item);
  return map;
}

function resolveRel(rel, incMap) {
  const data = rel?.data;
  if (!data) return [];
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((d) => incMap.get(`${d.type}:${d.id}`)).filter(Boolean);
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The author block is the first `<p class="text-align-right">` (name / email /
 * affiliation separated by <br>). Extract it to frontmatter and drop it from
 * the body so it is not duplicated.
 */
function extractAuthor(html) {
  const m = html.match(/<p[^>]*class="[^"]*text-align-right[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return { html, author: undefined, email: undefined, affiliation: undefined };
  const lines = m[1]
    .split(/<br\s*\/?>/i)
    .map((l) => stripTags(l))
    .filter(Boolean);
  const email = lines.find((l) => /@/.test(l));
  const nonEmail = lines.filter((l) => l !== email);
  return {
    html: html.replace(m[0], ""),
    author: nonEmail[0],
    email,
    affiliation: nonEmail.slice(1).join(", ") || undefined,
  };
}

function extractAbstract(html) {
  const m = html.match(/<p[^>]*class="[^"]*\bresumen\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  return m ? stripTags(m[1]) : undefined;
}

async function localizeBody(html) {
  let out = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const srcs = [...out.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of [...new Set(srcs)]) {
    if (!src.includes("/sites/default/files")) continue;
    try {
      const localPath = await downloadAsset(src.split("?")[0]);
      out = out.split(src).join(localPath);
    } catch (err) {
      console.warn(`  ! img skip ${src}: ${err.message}`);
    }
  }
  return out;
}

function yamlScalar(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(String(v)); // valid double-quoted YAML scalar
}

function frontmatter(obj) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

async function writeDoc(collection, lang, slug, fm, body) {
  const dir = path.join(CONTENT, collection, lang);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${slug}.md`), frontmatter(fm) + body.trim() + "\n");
}

// The order of papers inside an issue is manual in Drupal (a View) and cannot be
// derived from any field, so read it from the issue page itself and store it as
// `issueOrder` (editable in the CMS). Cached: one request per issue.
const issueOrderCache = new Map();
async function issueOrderOf(issue, slug) {
  if (!issue) return undefined;
  if (!issueOrderCache.has(issue)) {
    let slugs = [];
    try {
      const res = await fetch(`${ORIGIN}/es/numero-${issue}`, { redirect: "follow" });
      const html = res.ok ? await res.text() : "";
      slugs = [...html.matchAll(/<h2[^>]*>\s*<a href="[^"]*\/paper\/([^"/?#]+)/g)].map((m) => m[1]);
    } catch {
      /* leave empty: papers of this issue just get no explicit order */
    }
    issueOrderCache.set(issue, slugs);
  }
  const i = issueOrderCache.get(issue).indexOf(slug);
  return i === -1 ? undefined : i + 1;
}

async function importType({ collection, drupalType, includes, map }) {
  for (const lang of LANGS) {
    // Page size kept at 20: Drupal errors out serving 50 nodes with several
    // includes in one page.
    const inc = includes ? `include=${includes}&` : "";
    let url = `${ORIGIN}/${lang}/jsonapi/node/${drupalType}?${inc}page%5Blimit%5D=20&sort=-created`;
    let count = 0;
    while (url && count < LIMIT) {
      const data = await fetchJson(url);
      const incMap = indexIncluded(data.included);
      for (const node of data.data) {
        if (count >= LIMIT) break;
        // Skip language fallbacks: under /en or /fr Drupal returns the default
        // (es) content for untranslated nodes. Only import genuine translations;
        // the site falls back to the default language at render time.
        if (node.attributes.langcode && node.attributes.langcode !== lang) continue;
        if (SKIP_NIDS.has(node.attributes.drupal_internal__nid)) continue;
        try {
          await map(node, incMap, lang);
          count++;
        } catch (err) {
          console.warn(`  ! ${lang} node skip: ${err.message}`);
        }
      }
      url = count < LIMIT ? data.links?.next?.href || null : null;
    }
    console.log(`  ${collection} [${lang}]: ${count} documents`);
  }
}

async function run() {
  console.log(`Importing from ${ORIGIN} — ${ALL ? "ALL" : `${LIMIT}/lang`}\n`);

  console.log("Papers:");
  await importType({
    collection: "papers",
    drupalType: "paper",
    // field_autor is intentionally NOT included: combined with the other
    // includes the Drupal endpoint errors out. The author (name/email/
    // affiliation) is read from the body block instead.
    includes: "field_image,field_archivo,field_categoria,field_palabras_clave",
    map: async (node, incMap, lang) => {
      const a = node.attributes;
      const r = node.relationships ?? {};
      const nid = a.drupal_internal__nid;
      const slug = slugFromAlias(a.path?.alias, a.title);
      const section = resolveRel(r.field_categoria, incMap)[0]?.attributes?.name;
      const keywords = resolveRel(r.field_palabras_clave, incMap).map((t) => t.attributes.name);

      let heroImage;
      const img = resolveRel(r.field_image, incMap)[0];
      if (img?.attributes?.uri?.url) {
        const u = img.attributes.uri.url;
        heroImage = await downloadAsset(u);
      }
      let pdf;
      const doc = resolveRel(r.field_archivo, incMap)[0];
      if (doc?.attributes?.uri?.url) {
        const u = doc.attributes.uri.url;
        pdf = await downloadAsset(u);
      }

      const rawHtml = a.body?.processed || a.body?.value || "";
      const abstract = extractAbstract(rawHtml);
      const { html: noAuthor, author, email, affiliation } = extractAuthor(rawHtml);
      const localized = await localizeBody(noAuthor);
      const body = td.turndown(localized);

      await writeDoc("papers", lang, slug, {
        lang,
        translationKey: String(nid),
        slug,
        title: a.title,
        section,
        // Hyperborea issue number (Drupal: field_publicacion_hyperborea, 1–8).
        issue: a.field_publicacion_hyperborea ?? undefined,
        issueOrder: await issueOrderOf(a.field_publicacion_hyperborea, slug),
        author,
        email,
        affiliation,
        abstract,
        keywords,
        // Drupal creation timestamp: listings sort by it (see src/lib/content.ts).
        created: a.created ? new Date(a.created).toISOString() : undefined,
        // Dates shown under the paper. Only the real Drupal fields: no fallback to
        // the node's creation date (84 papers have no publication date there).
        receivedDate: a.field_fecha_de_recepcion || undefined,
        evaluatedDate: a.field_fecha_de_evaluacion || undefined,
        publishedDate: a.field_fecha_publicado || undefined,
        heroImage,
        pdf,
        draft: a.status === false,
        sourceUrl: `${ORIGIN}/${lang}${a.path?.alias || ""}`,
      }, body);
    },
  });

  console.log("\nActivities:");
  await importType({
    collection: "articles",
    drupalType: "article",
    includes: "field_image,field_archivo",
    map: async (node, incMap, lang) => {
      const a = node.attributes;
      const r = node.relationships ?? {};
      const nid = a.drupal_internal__nid;
      const slug = slugFromAlias(a.path?.alias, a.title);

      let heroImage;
      const img = resolveRel(r.field_image, incMap)[0];
      if (img?.attributes?.uri?.url) {
        const u = img.attributes.uri.url;
        heroImage = await downloadAsset(u);
      }
      let pdf;
      const doc = resolveRel(r.field_archivo, incMap)[0];
      if (doc?.attributes?.uri?.url) {
        const u = doc.attributes.uri.url;
        pdf = await downloadAsset(u);
      }

      const html = await localizeBody(a.body?.processed || a.body?.value || "");
      const body = td.turndown(html);

      await writeDoc("articles", lang, slug, {
        lang,
        translationKey: String(nid),
        slug,
        title: a.title,
        created: a.created ? new Date(a.created).toISOString() : undefined,
        publishedDate: a.created?.slice(0, 10),
        heroImage,
        pdf,
        draft: a.status === false,
        sourceUrl: `${ORIGIN}/${lang}${a.path?.alias || ""}`,
      }, body);
    },
  });

  console.log("\nPages:");
  await importType({
    collection: "pages",
    drupalType: "page",
    includes: "",
    map: async (node, incMap, lang) => {
      const a = node.attributes;
      const nid = a.drupal_internal__nid;
      const slug = slugFromAlias(a.path?.alias, a.title);
      const html = await localizeBody(a.body?.processed || a.body?.value || "");
      const body = td.turndown(html);
      await writeDoc("pages", lang, slug, {
        lang,
        translationKey: String(nid),
        slug,
        title: a.title,
        draft: a.status === false,
        sourceUrl: `${ORIGIN}/${lang}${a.path?.alias || ""}`,
      }, body);
    },
  });

  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
