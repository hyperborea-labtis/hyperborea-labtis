// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Production domain (the current site's canonical host is www).
const SITE = "https://www.hyperborea-labtis.org";

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // URLs must stay identical to the current Drupal site: no trailing slash
  // (/es/paper/x) and one .html file per page, which Cloudflare Pages serves at
  // the extensionless URL without redirecting.
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
