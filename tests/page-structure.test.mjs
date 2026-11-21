import { test } from "node:test";
import assert from "node:assert/strict";
import { structureProblems } from "../src/lib/page-structure.ts";

const page = (body, { lang = "es", head = "" } = {}) =>
  `<!doctype html><html lang="${lang}"><head><title>x</title>${head}</head><body>` +
  `<a class="skip" href="#main-content">Pasar</a><header></header><main id="main-content" tabindex="-1">${body}</main></body></html>`;

const ok = page("<h1>Título</h1><h2>Uno</h2><h3>Sub</h3><img src=\"/a.png\" alt=\"\" />");

test("a well-formed page has no problems", () => {
  assert.deepEqual(structureProblems(ok, { strictOutline: true }), []);
});

test("exactly one <h1>: none or two are reported", () => {
  assert.match(structureProblems(page("<h2>x</h2>"), {}).join(), /0 <h1>/);
  assert.match(structureProblems(page("<h1>a</h1><h1>b</h1>"), {}).join(), /2 <h1>/);
});

test("headings that live inside <script>, <style> or comments are not counted", () => {
  const html = page('<h1>a</h1><script type="application/ld+json">{"x":"<h1>no</h1>"}</script><!-- <h1>no</h1> -->');
  assert.deepEqual(structureProblems(html, {}), []);
});

test("strict outline: a heading level may not skip (h1 → h3); relaxed pages only need one h1", () => {
  const skipped = page("<h1>a</h1><h3>b</h3>");
  assert.match(structureProblems(skipped, { strictOutline: true }).join(), /h1 → h3/);
  assert.deepEqual(structureProblems(skipped, {}), []);
  // going back up is always fine
  assert.deepEqual(structureProblems(page("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>"), { strictOutline: true }), []);
});

test("every <img> carries an alt attribute (empty is fine: decorative)", () => {
  assert.match(structureProblems(page('<h1>a</h1><img src="/a.png">'), {}).join(), /<img> without alt/);
  assert.deepEqual(structureProblems(page('<h1>a</h1><img src="/a.png" alt="">'), {}), []);
});

test("the skip link is the first link of the body and its target exists", () => {
  const noSkip = `<html lang="es"><body><a href="/x">x</a><main id="main-content"><h1>a</h1></main></body></html>`;
  assert.match(structureProblems(noSkip, {}).join(), /skip link/);
  const noTarget = `<html lang="es"><body><a href="#main-content">s</a><main><h1>a</h1></main></body></html>`;
  assert.match(structureProblems(noTarget, {}).join(), /#main-content/);
});

test("ids are unique within a page", () => {
  const dup = page('<h1>a</h1><a id="n1"></a><p id="n1"></p>');
  assert.match(structureProblems(dup, {}).join(), /duplicate id "n1"/);
});

test("lang attributes are valid language tags (html and parts)", () => {
  assert.match(structureProblems(page("<h1>a</h1>", { lang: "" }), {}).join(), /<html lang>/);
  assert.match(structureProblems(page('<h1>a</h1><p lang="espanol">x</p>'), {}).join(), /invalid lang "espanol"/);
  assert.deepEqual(structureProblems(page('<h1>a</h1><p lang="fr">x</p><p lang="pt-BR">y</p>'), {}), []);
});

test("aria-controls / aria-labelledby / aria-describedby point at ids that exist", () => {
  const broken = page('<h1>a</h1><button aria-expanded="false" aria-controls="menu-x">m</button>');
  assert.match(structureProblems(broken, {}).join(), /aria-controls="menu-x" points at no element/);
  const fine = page('<h1>a</h1><button aria-expanded="false" aria-controls="menu-x">m</button><ul id="menu-x"></ul><p id="d">x</p><input aria-describedby="d menu-x">');
  assert.deepEqual(structureProblems(fine, {}), []);
  assert.match(structureProblems(page('<h1>a</h1><input aria-describedby="nope">'), {}).join(), /aria-describedby="nope"/);
});

test("a button with aria-expanded must say what it expands (aria-controls)", () => {
  assert.match(structureProblems(page('<h1>a</h1><button aria-expanded="false">m</button>'), {}).join(), /aria-expanded without aria-controls/);
});

test("a card's picture link with no picture inside is reported: it is an empty, hidden link that text spacing clips", () => {
  const empty = '<article class="hb-card"><a class="hb-card-media" href="/es/paper/x" aria-hidden="true" tabindex="-1"><span class="hb-card-overlay" aria-hidden="true">+</span></a><h2><a href="/es/paper/x">X</a></h2></article>';
  assert.match(structureProblems(page("<h1>T</h1>" + empty), {}).join(), /picture link/);
  const full = empty.replace('<span class="hb-card-overlay"', '<img src="/a.webp" alt="" /><span class="hb-card-overlay"');
  assert.deepEqual(structureProblems(page("<h1>T</h1>" + full), {}), []);
  const none = '<article class="hb-card"><h2><a href="/es/paper/x">X</a></h2></article>';
  assert.deepEqual(structureProblems(page("<h1>T</h1>" + none), {}), []);
});
