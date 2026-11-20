import { test } from "node:test";
import assert from "node:assert/strict";
import { relatedPapers } from "../src/lib/related.ts";

const p = (slug, o = {}) => ({ slug, title: slug, keywords: [], issue: undefined, section: undefined, date: 0, ...o });

test("a paper never relates to itself", () => {
  const a = p("a", { keywords: ["Cine"] });
  assert.deepEqual(relatedPapers(a, [a]), []);
});

test("shared keywords rank first, the most shared on top", () => {
  const a = p("a", { keywords: ["Cine", "Poesía", "Teatro"] });
  const one = p("one", { keywords: ["Cine"], date: 9 });
  const two = p("two", { keywords: ["Cine", "Poesía"], date: 1 });
  assert.deepEqual(relatedPapers(a, [a, one, two]).map((r) => r.slug), ["two", "one"]);
});

test("keywords match ignoring case and accents", () => {
  const a = p("a", { keywords: ["Fotografía"] });
  const b = p("b", { keywords: ["fotografia"] });
  assert.deepEqual(relatedPapers(a, [a, b]).map((r) => r.slug), ["b"]);
});

test("same issue relates even without shared keywords; other issues without them do not", () => {
  const a = p("a", { issue: 3, keywords: ["Cine"] });
  const sameIssue = p("same", { issue: 3 });
  const other = p("other", { issue: 4 });
  assert.deepEqual(relatedPapers(a, [a, sameIssue, other]).map((r) => r.slug), ["same"]);
});

test("a shared keyword outweighs sharing the issue and section", () => {
  const a = p("a", { issue: 3, section: "S", keywords: ["Cine"] });
  const kw = p("kw", { issue: 9, keywords: ["Cine"] });
  const near = p("near", { issue: 3, section: "S" });
  assert.deepEqual(relatedPapers(a, [a, near, kw]).map((r) => r.slug), ["kw", "near"]);
});

test("ties go to the newest, and the list is capped", () => {
  const a = p("a", { keywords: ["Cine"] });
  const all = [a, ...[1, 2, 3, 4, 5].map((n) => p(`p${n}`, { keywords: ["Cine"], date: n }))];
  assert.deepEqual(relatedPapers(a, all, 3).map((r) => r.slug), ["p5", "p4", "p3"]);
  assert.equal(relatedPapers(a, all).length, 4);
});

test("the result is stable whatever the input order", () => {
  const a = p("a", { keywords: ["Cine"] });
  const xs = ["x", "y", "z"].map((s) => p(s, { keywords: ["Cine"], date: 5 }));
  const fwd = relatedPapers(a, [a, ...xs]).map((r) => r.slug);
  const rev = relatedPapers(a, [a, ...[...xs].reverse()]).map((r) => r.slug);
  assert.deepEqual(fwd, rev);
});
