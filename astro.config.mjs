// @ts-check
import { defineConfig } from "astro/config";
import fs from "node:fs";
import path from "node:path";
import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import { footnotes } from "./src/plugins/footnotes.mjs";
import { sanitize } from "./src/plugins/sanitize.mjs";

// Production domain: the apex, hyperborea-labtis.org (the old Drupal site's canonical
// link uses it). `www` also answers there today; at launch it must 301 to the apex.
const SITE = "https://hyperborea-labtis.org";

// Dev-server helpers (neither runs in the build nor in production):
// - `astro dev` serves public/admin/index.html at /admin/index.html but 404s on
//   /admin and /admin/ (trailingSlash "never"); Workers Assets already serves
//   /admin in production, so only the dev server needs the rewrite.
// - The search index (/pagefind/*) only exists after `npm run build`, which
//   writes it to dist/. `astro dev` knows nothing about dist/, so serve it from
//   there: search then works on the dev server (with the content of the last build).
/** @type {Record<string, string>} */
const PAGEFIND_TYPES = { ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
/** @type {import("astro").AstroIntegration} */
const devServerExtras = {
  name: "dev-server-extras",
  hooks: {
    "astro:server:setup": ({ server }) => {
      const pagefindDir = path.resolve("dist", "pagefind");
      server.middlewares.use((req, res, next) => {
        if (req.url === "/admin" || req.url?.startsWith("/admin?") || req.url === "/admin/") {
          req.url = "/admin/index.html";
          return next();
        }
        const m = req.url?.match(/^\/pagefind\/([^?#]+)/);
        if (!m) return next();
        const file = path.resolve(pagefindDir, decodeURIComponent(m[1]));
        if (!file.startsWith(pagefindDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader("Content-Type", PAGEFIND_TYPES[path.extname(file)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
  },
};

// Slugs that REALLY exist in each language (own text, not the Spanish fallback). The
// untranslated /en and /fr copies are noindex (see src/lib/seo.ts), so they must stay out of
// the sitemap. Read from the frontmatter of src/content/<collection>/<lang>/*.md.
/** @type {Record<string, Record<string, Set<string>>>} */
const REAL = {};
for (const collection of ["papers", "articles", "pages"]) {
  REAL[collection] = {};
  for (const lang of ["es", "en", "fr"]) {
    const dir = path.join("src", "content", collection, lang);
    REAL[collection][lang] = new Set();
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const head = fs.readFileSync(path.join(dir, f), "utf8").slice(0, 3000);
      const slug = /^slug:\s*"?([^"\n]+?)"?\s*$/m.exec(head)?.[1];
      REAL[collection][lang].add(slug ?? f.replace(/\.md$/, ""));
    }
  }
}
const PAGE_SLUGS = new Set(Object.values(REAL.pages).flatMap((s) => [...s]));

/** @param {string} pathname */
function inSitemap(pathname) {
  if (pathname.includes("/taxonomy/term/") || pathname.endsWith("/buscar") || pathname.includes("/search/")) return false;
  const m = /^\/(en|fr)\/(paper|actividad)\/([^/]+)$/.exec(pathname);
  if (m) return REAL[m[2] === "paper" ? "papers" : "articles"][m[1]].has(m[3]);
  const p = /^\/(en|fr)\/([^/]+)$/.exec(pathname);
  if (p && PAGE_SLUGS.has(p[2])) return REAL.pages[p[1]].has(p[2]);
  return true;
}

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // URLs must stay identical to the current Drupal site: no trailing slash
  // (/es/paper/x) and one .html file per page, which Cloudflare Pages serves at
  // the extensionless URL without redirecting.
  // Footnote links (#01) lost their targets in the import; rebuilt at render time.
  // Raw HTML in Markdown is sanitized first (scripts, handlers, javascript: URLs).
  // `satteri()` is Astro's default Markdown processor; this only adds the plugins.
  markdown: { processor: satteri({ hastPlugins: [sanitize, footnotes] }) },
  trailingSlash: "never",
  build: { format: "file" },
  // Never inline assets as data: URIs (fonts included): keeps the CSP free of `data:`
  // and the render-blocking stylesheet small; files cache on their own.
  vite: { build: { assetsInlineLimit: 0 } },
  // Content-Security-Policy as a <meta> on every page: Astro hashes the inline
  // scripts/styles it emits, so no 'unsafe-inline' is needed. Pagefind's search
  // runs WebAssembly (hence 'wasm-unsafe-eval'). frame-ancestors and the headers a
  // <meta> cannot carry live in public/_headers. /admin has its own CSP there.
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // challenges.cloudflare.com: the Turnstile widget on the contact form.
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'", "https://challenges.cloudflare.com"] },
    },
  },
  redirects: { "/": "/es" },
  // Three-language site: Spanish (default), English, French — matching the
  // source Drupal (/es, /en, /fr). Every locale is prefixed, like the source.
  i18n: {
    locales: ["es", "en", "fr"],
    defaultLocale: "es",
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
    },
  },
  integrations: [
    devServerExtras,
    sitemap({
      // Only indexable pages: no keyword pages, search, redirect stubs or untranslated
      // copies. No `i18n` option: it would cross-link every URL in three languages, but
      // only real translations may be alternates (hreflang is emitted in <head>).
      filter: (page) => inSitemap(new URL(page).pathname),
    }),
  ],
});
