import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, colorProblems } from "../src/lib/contrast.ts";

test("contrastRatio matches the WCAG formula (known values)", () => {
  assert.equal(contrastRatio("#000", "#fff").toFixed(2), "21.00");
  assert.equal(contrastRatio("#ffffff", "#ffffff").toFixed(2), "1.00");
  assert.equal(contrastRatio("#d8b200", "#ffffff").toFixed(2), "2.04"); // the old yellow text
  assert.equal(contrastRatio("#7a6200", "#fff").toFixed(2), "5.87");
  assert.equal(contrastRatio("#fff", "#7a6200"), contrastRatio("#7a6200", "#fff")); // order does not matter
});

const css = (over = {}) => {
  const t = { "--hb-yellow": "#d8b200", "--hb-yellow-text": "#7a6200", "--hb-yellow-large": "#9c8100", "--hb-control-border": "#767676", "--hb-muted": "#595959", "--hb-ink": "#2e3436", ...over };
  return `.hb-root { ${Object.entries(t).map(([k, v]) => `${k}: ${v};`).join(" ")} }
.hb-nav-link:hover { color: var(--hb-yellow); }
.hb-article a { color: var(--hb-yellow-text); }`;
};

test("the declared token pairs pass their WCAG thresholds", () => {
  assert.deepEqual(colorProblems(css()), []);
});

test("a token that drops below its threshold is reported with the pair and the ratio", () => {
  assert.match(colorProblems(css({ "--hb-yellow-text": "#d8b200" })).join(), /--hb-yellow-text.*2\.04.*4\.5/);
  assert.match(colorProblems(css({ "--hb-control-border": "#bdbdbd" })).join(), /--hb-control-border/);
  assert.match(colorProblems(css({ "--hb-muted": "#808080" })).join(), /--hb-muted/);
});

test("the plain brand yellow may only color text on the dark surfaces (header)", () => {
  const bad = css() + "\n.hb-article h2 { color: var(--hb-yellow); }";
  assert.match(colorProblems(bad).join(), /\.hb-article h2.*--hb-yellow/);
  const fine = css() + "\n.hb-lang-link.is-active { color: var(--hb-yellow); }\n.hb-submenu a:hover { color: var(--hb-yellow); }\n.hb-search-link { color: var(--hb-yellow); }";
  assert.deepEqual(colorProblems(fine), []);
});

test("a missing token is a problem, not a silent pass", () => {
  assert.match(colorProblems(".hb-root { --hb-yellow: #d8b200; }").join(), /--hb-yellow-text.*missing/);
});
