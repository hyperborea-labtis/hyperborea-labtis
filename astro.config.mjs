// @ts-check
import { defineConfig } from "astro/config";
import fs from "node:fs";
import path from "node:path";
import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import { footnotes } from "./src/plugins/footnotes.mjs";

// Production domain (the current site's canonical host is www).
const SITE = "https://www.hyperborea-labtis.org";

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

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // URLs must stay identical to the current Drupal site: no trailing slash
  // (/es/paper/x) and one .html file per page, which Cloudflare Pages serves at
  // the extensionless URL without redirecting.
  // Footnote links (#01) lost their targets in the import; rebuilt at render time.
  // `satteri()` is Astro's default Markdown processor; this only adds the plugin.
  markdown: { processor: satteri({ hastPlugins: [footnotes] }) },
  trailingSlash: "never",
  build: { format: "file" },
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
      // Keyword pages keep their old URLs but were never in the old sitemap.
      filter: (page) => !page.includes("/taxonomy/term/"),
      i18n: {
        defaultLocale: "es",
        locales: { es: "es", en: "en", fr: "fr" },
      },
    }),
  ],
});
