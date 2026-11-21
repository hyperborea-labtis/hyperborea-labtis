import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsp, mergeCsps, cspProblems, parseHeadersFile, languageRules, LANGUAGE_PATHS } from "../src/lib/csp.ts";

const page = (hashes, extra = "") =>
  `default-src 'self';img-src 'self' data:;object-src 'none';base-uri 'self'; script-src 'self' 'wasm-unsafe-eval' ${hashes.map((h) => `'sha256-${h}'`).join(" ")}${extra}; style-src 'self' ;`;

test("parseCsp: directives and sources, whatever the spacing", () => {
  const csp = parseCsp("default-src 'self';img-src 'self' data: ; script-src 'self' 'sha256-AAA='");
  assert.deepEqual([...csp.keys()], ["default-src", "img-src", "script-src"]);
  assert.deepEqual(csp.get("img-src"), ["'self'", "data:"]);
  assert.deepEqual(csp.get("script-src"), ["'self'", "'sha256-AAA='"]);
});

test("mergeCsps: pages that differ only in script hashes merge into one policy holding every hash", () => {
  const { csp, problems } = mergeCsps([page(["A", "B"]), page(["B", "C"]), page(["A", "B"])]);
  assert.deepEqual(problems, []);
  const script = parseCsp(csp).get("script-src");
  assert.deepEqual(script.filter((s) => s.startsWith("'sha256-")).sort(), ["'sha256-A'", "'sha256-B'", "'sha256-C'"]);
  assert.ok(script.includes("'wasm-unsafe-eval'"));
});

test("mergeCsps: a page that LOOSENS the policy (a new source that is not a hash) is reported, not merged silently", () => {
  const { problems } = mergeCsps([page(["A"]), page(["A"], " https://evil.example")]);
  assert.match(problems.join(), /script-src/);
  assert.match(problems.join(), /evil\.example/);
  const other = mergeCsps([page(["A"]), page(["A"]).replace("img-src 'self' data:", "img-src *")]);
  assert.match(other.problems.join(), /img-src/);
});

test("cspProblems: a sound policy has none", () => {
  assert.deepEqual(cspProblems(page(["A"])), []);
});

test("cspProblems: unsafe-inline / unsafe-eval in scripts, wildcards, missing object-src/base-uri are reported", () => {
  assert.match(cspProblems(page(["A"], " 'unsafe-inline'")).join(), /unsafe-inline/);
  assert.match(cspProblems(page(["A"], " 'unsafe-eval'")).join(), /unsafe-eval/);
  assert.match(cspProblems(page(["A"], " *")).join(), /wildcard/i);
  assert.match(cspProblems("default-src 'self'; script-src 'self'").join(), /object-src/);
  assert.match(cspProblems("default-src 'self'; script-src 'self'; object-src 'none'").join(), /base-uri/);
  assert.match(cspProblems("script-src 'self'; object-src 'none'; base-uri 'self'").join(), /default-src/);
});

test("cspProblems: style-src 'unsafe-inline' is only tolerated when the caller says so (the CMS needs it)", () => {
  const withStyle = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'";
  assert.match(cspProblems(withStyle).join(), /style-src/);
  assert.deepEqual(cspProblems(withStyle, { allowInlineStyle: true }), []);
});

const FILE = `# comment
/*
  X-Content-Type-Options: nosniff
  Content-Security-Policy: frame-ancestors 'none'

/es
  Content-Security-Policy: default-src 'self'
/es/*
  Content-Security-Policy: default-src 'self'
  Cache-Control: public
`;

test("parseHeadersFile: rules in order, header names kept, comments and blank lines ignored", () => {
  const rules = parseHeadersFile(FILE);
  assert.deepEqual(rules.map((r) => r.path), ["/*", "/es", "/es/*"]);
  assert.deepEqual(rules[0].headers, [
    ["X-Content-Type-Options", "nosniff"],
    ["Content-Security-Policy", "frame-ancestors 'none'"],
  ]);
  assert.equal(rules[2].headers.length, 2);
});

test("languageRules: one rule per language, for the page and everything under it, and never /* (it would hit /admin)", () => {
  const text = languageRules("default-src 'self'");
  const rules = parseHeadersFile(text);
  assert.deepEqual(rules.map((r) => r.path), LANGUAGE_PATHS);
  assert.deepEqual(LANGUAGE_PATHS, ["/es", "/es/*", "/en", "/en/*", "/fr", "/fr/*"]);
  for (const r of rules) assert.deepEqual(r.headers, [["Content-Security-Policy", "default-src 'self'"]]);
});

test("languageRules: refuses a line longer than the 2000 characters Cloudflare accepts", () => {
  assert.throws(() => languageRules("default-src " + "x".repeat(2000)), /2000/);
});
