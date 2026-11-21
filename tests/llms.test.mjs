import { test } from "node:test";
import assert from "node:assert/strict";
import { llmsTxt } from "../src/lib/llms.ts";

const input = {
  site: "https://hyperborea-labtis.org",
  issues: [
    { n: 8, year: 2025 },
    { n: 7, year: 2024 },
  ],
  sections: [{ label: "Mare Sugenum", path: "Mare_Sugenum" }],
};
const out = llmsTxt(input);

test("llms.txt follows the format: an H1, a blockquote summary, then sections of links", () => {
  const lines = out.split("\n");
  assert.match(lines[0], /^# Hyperborea\. Revista de ensayo y creación$/);
  assert.ok(lines.some((l) => l.startsWith("> ")), "a summary in a blockquote");
  assert.ok(lines.some((l) => l.startsWith("## ")));
  assert.ok(out.endsWith("\n") && !out.endsWith("\n\n"));
});

test("every link is absolute and on the site's own domain (or the licence)", () => {
  const links = [...out.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 8);
  for (const l of links) assert.match(l, /^https:\/\/(hyperborea-labtis\.org|creativecommons\.org)\//, l);
});

test("lists every issue with its year, newest first, and the sections", () => {
  assert.ok(out.indexOf("Número 8 (2025)") < out.indexOf("Número 7 (2024)"));
  assert.ok(out.includes("https://hyperborea-labtis.org/es/numero-8"));
  assert.ok(out.includes("https://hyperborea-labtis.org/es/Mare_Sugenum"));
});

test("states the licence terms and how to cite, and welcomes crawlers on those terms", () => {
  assert.match(out, /CC BY-NC-ND 3\.0/);
  assert.ok(out.includes("https://creativecommons.org/licenses/by-nc-nd/3.0/"));
  assert.match(out, /Cómo citar/);
  assert.match(out, /sin uso comercial/i);
  assert.match(out, /ISSN 2618-4397/);
});

test("points to the machine-readable sources: sitemap and the three feeds", () => {
  assert.ok(out.includes("https://hyperborea-labtis.org/sitemap-index.xml"));
  for (const l of ["es", "en", "fr"]) assert.ok(out.includes(`https://hyperborea-labtis.org/${l}/rss.xml`));
});
