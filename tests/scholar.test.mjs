import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAuthors, scholarDate, isoDate, scholarTags } from "../src/lib/scholar.ts";
import { organizationNode, periodicalNode, issueNode, articleNode, activityNode, pageNode, breadcrumbNode, websiteNode, serializeJsonLd } from "../src/lib/jsonld.ts";
import { homeWord, activitiesTitle } from "../src/lib/descriptions.ts";
import { resolveHead } from "../src/lib/seo.ts";

const SITE = "https://hyperborea-labtis.org";

test("parseAuthors: one name per author, no note marker, no honorific, joined by y / e / & / ;", () => {
  assert.deepEqual(parseAuthors("Anthony Stanton[1]"), ["Anthony Stanton"]);
  assert.deepEqual(parseAuthors("Por el Dr. Kurt Pinthus[1]"), ["Kurt Pinthus"]);
  assert.deepEqual(parseAuthors("Daniela Paolini y Mario Rucavado Rojas"), ["Daniela Paolini", "Mario Rucavado Rojas"]);
  assert.deepEqual(parseAuthors("Ilse Ameyalli y Tadeo Pablo Stein"), ["Ilse Ameyalli", "Tadeo Pablo Stein"]);
  assert.deepEqual(parseAuthors("A. Uno & B. Dos; C. Tres"), ["A. Uno", "B. Dos", "C. Tres"]);
  assert.deepEqual(parseAuthors("  "), []);
  assert.deepEqual(parseAuthors(undefined), []);
});

test("dates: the full date when published, else the issue's year only (never an invented day)", () => {
  assert.equal(scholarDate(new Date("2025-11-28"), 2025), "2025/11/28");
  assert.equal(scholarDate(undefined, 2023), "2023");
  assert.equal(scholarDate(undefined, undefined), undefined);
  assert.equal(isoDate(new Date("2025-11-28"), 2025), "2025-11-28");
  assert.equal(isoDate(undefined, 2023), "2023");
  // a date late in the UTC day must not slip to the next/previous day
  assert.equal(scholarDate(new Date("2025-01-01T00:00:00.000Z"), 2025), "2025/01/01");
});

const base = {
  title: "La forma espacial en la literatura", authors: ["Joseph Frank"], institution: "Stanford University",
  date: "2021", journal: "Hyperborea. Revista de ensayo y creación", issn: "2618-4397", volume: 4, language: "es",
  keywords: ["espacio", "literatura"], abstractUrl: `${SITE}/es/paper/x`, pdfUrl: `${SITE}/sites/default/files/x.pdf`, publisher: "LabTIS",
};

test("scholarTags: Google Scholar's citation_* set, in a stable order", () => {
  const t = scholarTags(base);
  const names = t.map((x) => x.name);
  assert.deepEqual(names, [
    "citation_title", "citation_author", "citation_author_institution", "citation_publication_date", "citation_journal_title",
    "citation_issn", "citation_volume", "citation_language", "citation_keywords", "citation_abstract_html_url",
    "citation_fulltext_html_url", "citation_pdf_url", "citation_publisher",
  ]);
  const get = (n) => t.find((x) => x.name === n).content;
  assert.equal(get("citation_volume"), "4");
  assert.equal(get("citation_keywords"), "espacio; literatura");
  assert.equal(get("citation_pdf_url"), `${SITE}/sites/default/files/x.pdf`);
});

test("scholarTags: several authors get one tag each and no institution (it cannot be mapped to a person)", () => {
  const t = scholarTags({ ...base, authors: ["Ana Uno", "Beto Dos"] });
  assert.deepEqual(t.filter((x) => x.name === "citation_author").map((x) => x.content), ["Ana Uno", "Beto Dos"]);
  assert.equal(t.some((x) => x.name === "citation_author_institution"), false);
});

test("scholarTags: optional pieces are left out, never emitted empty", () => {
  const t = scholarTags({ ...base, authors: [], institution: undefined, date: undefined, volume: undefined, keywords: [], pdfUrl: undefined });
  const names = t.map((x) => x.name);
  for (const n of ["citation_author", "citation_publication_date", "citation_volume", "citation_keywords", "citation_pdf_url"]) assert.ok(!names.includes(n), n);
  assert.ok(t.every((x) => x.content.trim() !== ""));
});

test("JSON-LD: the publisher, the journal and the issue link up by @id", () => {
  const org = organizationNode(SITE);
  const journal = periodicalNode(SITE);
  const issue = issueNode(SITE, { lang: "es", n: 8, year: 2025, title: "Hyperborea 8 (2025)" });
  assert.equal(org["@type"], "ResearchOrganization");
  assert.equal(org.address.addressLocality, "Viedma");
  assert.equal(journal["@type"], "Periodical");
  assert.equal(journal.issn, "2618-4397");
  assert.deepEqual(journal.publisher, { "@id": org["@id"] });
  assert.equal(issue["@type"], "PublicationIssue");
  assert.equal(issue.issueNumber, "8");
  assert.equal(issue.datePublished, "2025");
  assert.deepEqual(issue.isPartOf, { "@id": journal["@id"] });
  assert.equal(issue.url, `${SITE}/es/numero-8`);
});

test("articleNode: a ScholarlyArticle with the fields search engines read", () => {
  const issue = issueNode(SITE, { lang: "es", n: 4, year: 2021, title: "Hyperborea 4 (2021)" });
  const a = articleNode(SITE, {
    lang: "es", url: `${SITE}/es/paper/x`, title: "La forma espacial en la literatura: hacia una teoría general", authors: ["Joseph Frank"],
    institution: "Stanford University", date: "2021", keywords: ["espacio", "literatura"], abstract: "Un resumen.", section: "Mare Sugenum",
    image: `${SITE}/sites/default/files/a.png`, pdfUrl: `${SITE}/sites/default/files/a.pdf`, issue,
  });
  assert.equal(a["@type"], "ScholarlyArticle");
  assert.equal(a.author[0]["@type"], "Person");
  assert.equal(a.author[0].affiliation.name, "Stanford University");
  assert.equal(a.datePublished, "2021");
  assert.equal(a.inLanguage, "es");
  assert.deepEqual(a.isPartOf, { "@id": issue["@id"] });
  assert.equal(a.isAccessibleForFree, true);
  assert.equal(a.associatedMedia.encodingFormat, "application/pdf");
  assert.equal(a.license, "https://creativecommons.org/licenses/by-nc-nd/3.0/");
  const noAuthor = articleNode(SITE, { lang: "es", url: `${SITE}/es/paper/y`, title: "Sin autor", authors: [], date: undefined, keywords: [], issue });
  assert.equal("author" in noAuthor, false);
  assert.equal("datePublished" in noAuthor, false);
  assert.equal("associatedMedia" in noAuthor, false);
});

test("articleNode: a very long title is shortened for `headline` but kept whole in `name`", () => {
  const long = "Una investigación extensa y detallada ".repeat(6).trim();
  const a = articleNode(SITE, { lang: "es", url: `${SITE}/es/paper/z`, title: long, authors: [], keywords: [], issue: issueNode(SITE, { lang: "es", n: 1, year: 2018, title: "H" }) });
  assert.equal(a.name, long);
  assert.ok(a.headline.length <= 110 && a.headline.endsWith("…"), a.headline);
});

test("breadcrumbNode: positions from 1, absolute URLs, the last item without link", () => {
  const b = breadcrumbNode(SITE, "es", [{ name: "Inicio", path: "" }, { name: "Hyperborea 8 (2025)", path: "/numero-8" }, { name: "Un paper", path: "/paper/x" }]);
  assert.equal(b["@type"], "BreadcrumbList");
  assert.deepEqual(b.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.equal(b.itemListElement[0].item, `${SITE}/es`);
  assert.equal(b.itemListElement[1].item, `${SITE}/es/numero-8`);
  assert.equal("item" in b.itemListElement[2], false);
});

test("websiteNode names the site for search results", () => {
  const w = websiteNode(SITE, "en");
  assert.equal(w["@type"], "WebSite");
  assert.equal(w.name, "Hyperborea");
  assert.equal(w.inLanguage, "en");
});

test("serializeJsonLd: valid JSON that cannot close the <script> tag", () => {
  const out = serializeJsonLd([{ "@type": "Thing", name: 'Evil </script><script>alert(1)</script> & <b>' }]);
  assert.ok(!out.includes("</script"), out);
  assert.ok(!out.includes("<"), out);
  const parsed = JSON.parse(out);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@graph"][0].name, 'Evil </script><script>alert(1)</script> & <b>');
});

test("activityNode and pageNode: Article and WebPage with the basics", () => {
  const a = activityNode(SITE, { lang: "es", url: `${SITE}/es/actividad/x`, title: "Simposio", description: "Una descripción.", date: "2024-10-01", image: `${SITE}/sites/default/files/s.jpg` });
  assert.equal(a["@type"], "Article");
  assert.equal(a.headline, "Simposio");
  assert.equal(a.datePublished, "2024-10-01");
  assert.deepEqual(a.publisher, { "@id": organizationNode(SITE)["@id"] });
  const p = pageNode(SITE, { lang: "es", url: `${SITE}/es/presentacion`, title: "Presentación", description: "Texto." });
  assert.equal(p["@type"], "WebPage");
  assert.equal(p.url, `${SITE}/es/presentacion`);
  assert.equal("datePublished" in pageNode(SITE, { lang: "es", url: `${SITE}/es/x`, title: "x", description: "d" }), false);
});

test("breadcrumb labels exist in every language", () => {
  assert.deepEqual(["es", "en", "fr"].map(homeWord), ["Inicio", "Home", "Accueil"]);
  for (const l of ["es", "en", "fr"]) assert.ok(activitiesTitle(l).length > 10);
});

test("resolveHead says whether the PAGE is indexable, whatever the build mode", () => {
  const base = { site: SITE, locales: ["es", "en", "fr"], lang: "en", path: "/paper/x" };
  assert.equal(resolveHead({ ...base, indexable: false, contentLang: "en", alternates: ["en"] }).indexablePage, true);
  assert.equal(resolveHead({ ...base, indexable: true, contentLang: "es" }).indexablePage, false); // untranslated copy
  assert.equal(resolveHead({ ...base, indexable: true, noindex: true }).indexablePage, false);
  assert.equal(resolveHead({ ...base, indexable: true, canonicalPath: "/paper/y" }).indexablePage, false);
});
