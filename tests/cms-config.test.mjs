// The CMS validates what an editor types (pattern, required). Those rules must never block content that is
// already published: an editor could not save a paper without rewriting its abstract.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const config = YAML.parse(fs.readFileSync("public/admin/config.yml", "utf8"));
const collection = (name) => config.collections.find((c) => c.name === name);
const field = (col, name) => collection(col).fields.find((f) => f.name === name);

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []));
const read = (file) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(fs.readFileSync(file, "utf8"));
  return { data: YAML.parse(m[1]) ?? {}, body: m[2].trim() };
};

test("every pattern in the CMS config is a valid regular expression with a message", () => {
  let n = 0;
  for (const col of config.collections) {
    for (const f of col.fields ?? []) {
      if (!f.pattern) continue;
      n++;
      assert.equal(f.pattern.length, 2, `${col.name}.${f.name}: pattern is [regex, message]`);
      assert.doesNotThrow(() => new RegExp(f.pattern[0]), `${col.name}.${f.name}`);
      assert.ok(f.pattern[1].length > 20, `${col.name}.${f.name}: the message must tell the editor what to do`);
    }
  }
  assert.ok(n >= 5);
});

test("the abstract pattern accepts every published abstract and the empty one, and rejects what the site rejects", () => {
  const re = new RegExp(field("papers", "abstract").pattern[0]);
  for (const file of walk("src/content/papers")) {
    const { data } = read(file);
    assert.ok(re.test((data.abstract ?? "").trim()), `${file}: the CMS would refuse its abstract`);
  }
  const words = (k) => Array(k).fill("palabra").join(" ");
  assert.ok(re.test(""));
  assert.ok(re.test(words(30)) && re.test(words(300)));
  assert.ok(!re.test(words(29)) && !re.test(words(301)));
  assert.ok(!re.test(`${words(20)}\n${words(20)}`), "one paragraph");
  for (const bad of ["*x*", "a_b", "`x`", "# t", "[a](b)"]) assert.ok(!re.test(`${words(30)} ${bad}`), bad);
});

test("the body pattern accepts every published paper and page", () => {
  for (const [col, dir] of [["papers", "src/content/papers"], ["pages", "src/content/pages"]]) {
    const re = new RegExp(field(col, "body").pattern[0]);
    for (const file of walk(dir)) assert.ok(re.test(read(file).body), `${file}: the CMS would refuse its text`);
  }
});

test("the slug pattern accepts every published slug", () => {
  for (const [col, dir] of [["papers", "src/content/papers"], ["articles", "src/content/articles"], ["pages", "src/content/pages"]]) {
    const re = new RegExp(field(col, "slug").pattern[0]);
    for (const file of walk(dir)) assert.ok(re.test(String(read(file).data.slug)), `${file}: slug`);
  }
});

test("a paper must name its issue: the site cannot place it otherwise", () => {
  assert.equal(field("papers", "issue").required, true);
});
