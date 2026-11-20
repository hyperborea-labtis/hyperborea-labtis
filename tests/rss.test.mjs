import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeed, xmlText } from "../src/lib/rss.ts";

const base = { lang: "en", origin: "https://hyperborea-labtis.org", title: "Hyperborea. Journal", description: "Annual journal." };
const item = (o = {}) => ({ title: "T", url: "https://hyperborea-labtis.org/es/paper/a", ...o });

test("xmlText escapes markup and drops characters XML 1.0 forbids", () => {
  assert.equal(xmlText(`a & b <c> "d" 'e'`), "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  assert.equal(xmlText("ok\u0000\u0008\u000bend\ttab\nnl"), "okend\ttab\nnl");
});

test("channel: localized title and description, language, link to the home of that language", () => {
  const xml = buildFeed({ ...base, items: [item()] });
  assert.match(xml, /<title>Hyperborea\. Journal<\/title>/);
  assert.match(xml, /<description>Annual journal\.<\/description>/);
  assert.match(xml, /<language>en<\/language>/);
  assert.match(xml, /<link>https:\/\/hyperborea-labtis\.org\/en<\/link>/);
});

test("declares the atom and dc namespaces and a self link to the feed's own URL", () => {
  const xml = buildFeed({ ...base, items: [item()] });
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/">/);
  assert.match(xml, /<atom:link href="https:\/\/hyperborea-labtis\.org\/en\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/);
});

test("lastBuildDate is the newest item date (reproducible builds), omitted when no item has a date", () => {
  const items = [item({ date: new Date("2025-11-28T00:00:00Z") }), item({ date: new Date("2024-11-26T00:00:00Z") })];
  assert.match(buildFeed({ ...base, items }), /<lastBuildDate>Fri, 28 Nov 2025 00:00:00 GMT<\/lastBuildDate>/);
  assert.doesNotMatch(buildFeed({ ...base, items: [item()] }), /lastBuildDate/);
});

test("item: link equals the permalink guid; pubDate only with a date; order is kept", () => {
  const xml = buildFeed({
    ...base,
    items: [item({ title: "First", url: "https://hyperborea-labtis.org/es/paper/a", date: new Date("2025-11-28T00:00:00Z") }), item({ title: "Second", url: "https://hyperborea-labtis.org/es/paper/b" })],
  });
  assert.match(xml, /<title>First<\/title>\s*<link>https:\/\/hyperborea-labtis\.org\/es\/paper\/a<\/link>\s*<guid isPermaLink="true">https:\/\/hyperborea-labtis\.org\/es\/paper\/a<\/guid>\s*<pubDate>Fri, 28 Nov 2025 00:00:00 GMT<\/pubDate>/);
  assert.ok(xml.indexOf("First") < xml.indexOf("Second"));
  assert.equal((xml.match(/<pubDate>/g) ?? []).length, 1);
});

test("dc:creator once per author, nothing when there is none; summary becomes the description", () => {
  const xml = buildFeed({ ...base, items: [item({ creators: ["Ana & Co", "Luis"], summary: "Un <resumen>" }), item({ url: "https://hyperborea-labtis.org/es/paper/b" })] });
  assert.deepEqual(xml.match(/<dc:creator>[^<]*<\/dc:creator>/g), ["<dc:creator>Ana &amp; Co</dc:creator>", "<dc:creator>Luis</dc:creator>"]);
  assert.match(xml, /<description>Un &lt;resumen&gt;<\/description>/);
});

test("well-formed: starts with the XML declaration and ends with the closing tags", () => {
  const xml = buildFeed({ ...base, items: [] });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<rss '));
  assert.ok(xml.trimEnd().endsWith("</channel>\n</rss>"));
});
