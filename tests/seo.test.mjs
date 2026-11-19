import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, resolveHead, ogLocale, isIndexableBuild } from "../src/lib/seo.ts";

const SITE = "https://hyperborea-labtis.org";
const LOCALES = ["es", "en", "fr"];
const base = { site: SITE, locales: LOCALES, indexable: true };

test("absoluteUrl: joins the site and a locale-relative path, never a trailing slash", () => {
  assert.equal(absoluteUrl("/es/paper/x", SITE), "https://hyperborea-labtis.org/es/paper/x");
  assert.equal(absoluteUrl("/es", SITE + "/"), "https://hyperborea-labtis.org/es");
  assert.equal(absoluteUrl("/es/buscar?q=a b", SITE), "https://hyperborea-labtis.org/es/buscar?q=a%20b");
});

test("a translated page: self canonical and hreflang for every real locale + x-default", () => {
  const h = resolveHead({ ...base, lang: "en", path: "/numero-8" });
  assert.equal(h.canonical, "https://hyperborea-labtis.org/en/numero-8");
  assert.equal(h.robots, "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  assert.deepEqual(h.hreflang.map((l) => l.hreflang), ["es", "en", "fr", "x-default"]);
  assert.equal(h.hreflang.find((l) => l.hreflang === "fr").href, "https://hyperborea-labtis.org/fr/numero-8");
  assert.equal(h.hreflang.find((l) => l.hreflang === "x-default").href, "https://hyperborea-labtis.org/es/numero-8");
});

test("home has an empty path and still gets absolute URLs", () => {
  const h = resolveHead({ ...base, lang: "es", path: "" });
  assert.equal(h.canonical, "https://hyperborea-labtis.org/es");
  assert.equal(h.hreflang.find((l) => l.hreflang === "en").href, "https://hyperborea-labtis.org/en");
});

test("untranslated fallback (Spanish text served under /en): canonical to /es, noindex, no hreflang", () => {
  const h = resolveHead({ ...base, lang: "en", path: "/paper/x", contentLang: "es", alternates: ["es"] });
  assert.equal(h.canonical, "https://hyperborea-labtis.org/es/paper/x");
  assert.equal(h.robots, "noindex, follow");
  assert.deepEqual(h.hreflang, []);
});

test("the Spanish original with no translations: self canonical, index, no hreflang", () => {
  const h = resolveHead({ ...base, lang: "es", path: "/paper/x", contentLang: "es", alternates: ["es"] });
  assert.equal(h.canonical, "https://hyperborea-labtis.org/es/paper/x");
  assert.match(h.robots, /^index, follow/);
  assert.deepEqual(h.hreflang, []);
});

test("a real translation: each version is indexable and lists the real alternates only", () => {
  for (const lang of ["es", "en"]) {
    const h = resolveHead({ ...base, lang, path: "/paper/x", contentLang: lang, alternates: ["es", "en"] });
    assert.match(h.robots, /^index/);
    assert.deepEqual(h.hreflang.map((l) => l.hreflang), ["es", "en", "x-default"]);
  }
  assert.deepEqual(resolveHead({ ...base, lang: "fr", path: "/paper/x", contentLang: "es", alternates: ["es", "en"] }).hreflang, []);
});

test("noindex pages (search, 404) keep follow and get no hreflang", () => {
  const h = resolveHead({ ...base, lang: "es", path: "/buscar", noindex: true });
  assert.equal(h.robots, "noindex, follow");
  assert.deepEqual(h.hreflang, []);
});

test("a non-indexable build (dev domain, PR previews) is noindex,nofollow everywhere", () => {
  for (const extra of [{}, { noindex: true }, { contentLang: "es" }]) {
    const h = resolveHead({ ...base, indexable: false, lang: "es", path: "/paper/x", ...extra });
    assert.equal(h.robots, "noindex, nofollow");
  }
  // the structure (canonical, hreflang) does not change with the build mode
  const prod = resolveHead({ ...base, lang: "en", path: "/numero-8" });
  const dev = resolveHead({ ...base, indexable: false, lang: "en", path: "/numero-8" });
  assert.equal(dev.canonical, prod.canonical);
  assert.deepEqual(dev.hreflang, prod.hreflang);
});

test("og:locale follows the page language", () => {
  assert.equal(ogLocale("es"), "es_AR");
  assert.equal(ogLocale("en"), "en_US");
  assert.equal(ogLocale("fr"), "fr_FR");
});

test("isIndexableBuild: only an explicit PUBLIC_INDEXABLE=true on main (or outside Workers Builds)", () => {
  assert.equal(isIndexableBuild({}), false);
  assert.equal(isIndexableBuild({ PUBLIC_INDEXABLE: "false" }), false);
  assert.equal(isIndexableBuild({ PUBLIC_INDEXABLE: "true" }), true);
  assert.equal(isIndexableBuild({ PUBLIC_INDEXABLE: "true", WORKERS_CI_BRANCH: "main" }), true);
  assert.equal(isIndexableBuild({ PUBLIC_INDEXABLE: "true", WORKERS_CI_BRANCH: "feat/x" }), false);
});
