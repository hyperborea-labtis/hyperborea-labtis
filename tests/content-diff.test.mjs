import { test } from "node:test";
import assert from "node:assert/strict";
import { contentChanges } from "../src/lib/content-diff.ts";

const md = (fm, body = "Texto.\n") => `---\n${fm}\n---\n${body}`;
const base = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /sites/default/files/a.jpg');

test("an ordinary edit (title and text) raises nothing", () => {
  const after = md('title: "Uno bis"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /sites/default/files/a.jpg', "Otro texto.\n");
  assert.deepEqual(contentChanges(base, after), { errors: [], warnings: [] });
});

test("a new file is checked on its own: nothing to compare with", () => {
  assert.deepEqual(contentChanges(null, md('title: "Nuevo"\nslug: nuevo')), { errors: [], warnings: [] });
});

test("losing slug, translationKey, created or aliases (when they hold something) is an error: the CMS drops fields it does not know", () => {
  const rich = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases:\n  - /es/viejo\nheroImage: /sites/default/files/a.jpg');
  for (const key of ["slug", "translationKey", "created", "aliases"]) {
    const lines = ['title: "Uno"', "slug: uno-1", 'translationKey: "1"', "created: 2020-01-01T10:00", "aliases:\n  - /es/viejo", "heroImage: /sites/default/files/a.jpg"].filter((l) => !l.startsWith(key + ":"));
    const { errors } = contentChanges(rich, md(lines.join("\n")));
    assert.match(errors.join(), new RegExp(`${key}`), key);
  }
});

test("an empty list the CMS leaves out (aliases: []) is not a loss", () => {
  const after = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\nheroImage: /sites/default/files/a.jpg');
  assert.deepEqual(contentChanges(base, after).errors, []);
});

test("losing any other field is only a warning (the editor may have cleared it on purpose)", () => {
  const after = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []');
  const { errors, warnings } = contentChanges(base, after);
  assert.deepEqual(errors, []);
  assert.match(warnings.join(), /heroImage/);
});

test("changing the slug without keeping the old address in aliases breaks the old URL", () => {
  const moved = md('title: "Uno"\nslug: uno-nuevo\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /sites/default/files/a.jpg');
  assert.match(contentChanges(base, moved).errors.join(), /slug/);
  const kept = md('title: "Uno"\nslug: uno-nuevo\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases:\n  - /es/paper/uno-1\nheroImage: /sites/default/files/a.jpg');
  assert.deepEqual(contentChanges(base, kept).errors, []);
});

test("a pasted image (data: URL) in the text is an error: it bloats the repository and the page", () => {
  const after = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /x.jpg', "![x](data:image/png;base64,AAAA)\n");
  assert.match(contentChanges(base, after).errors.join(), /data:/);
  // one that was already there is not blamed on this change
  const had = md('title: "Uno"\nslug: uno-1', "![x](data:image/png;base64,AAAA)\n");
  assert.deepEqual(contentChanges(had, had).errors, []);
});

test("a link destination written as ](< url) is an error: it renders as a broken %20 URL", () => {
  const after = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /x.jpg', "Ver [aquí](< https://example.org/a>).\n");
  assert.match(contentChanges(base, after).errors.join(), /link/i);
});

test("new empty fields the CMS writes are only a warning", () => {
  const after = md('title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /sites/default/files/a.jpg\nauthor: ""\nkeywords: []');
  const { errors, warnings } = contentChanges(base, after);
  assert.deepEqual(errors, []);
  assert.match(warnings.join(), /author/);
});

test("front matter that does not parse is an error", () => {
  assert.match(contentChanges(base, "sin frontmatter\n").errors.join(), /front matter/i);
  assert.match(contentChanges(base, "---\ntitle: [sin cerrar\n---\ncuerpo").errors.join(), /front matter/i);
});

const FM = 'title: "Uno"\nslug: uno-1\ntranslationKey: "1"\ncreated: 2020-01-01T10:00\naliases: []\nheroImage: /x.jpg';

test("emphasis the CMS turns into escaped characters (\\_texto\\_, \\*texto\\*) is an error: the italics become literal symbols", () => {
  const before = md(FM, "Ver _El beso_ y *Otro*.\n");
  const after = md(FM, "Ver \\_El beso\\_ y \\*Otro\\*.\n");
  const { errors } = contentChanges(before, after);
  assert.match(errors.join(), /escaped/i);
  assert.match(errors.join(), /_|\*/);
});

test("escapes that were already in the file are not blamed on this change", () => {
  const had = md(FM, "Un \\_guion\\_ de antes.\n");
  assert.deepEqual(contentChanges(had, md(FM, "Un \\_guion\\_ de antes, y más texto.\n")).errors, []);
});

test("a new file is not compared, but one that arrives full of escapes is still reported", () => {
  assert.match(contentChanges(null, md(FM, "Ver \\_x\\_.\n")).errors.join(), /escaped/i);
});

test("plain underscores and asterisks (italics, URLs, lists) raise nothing", () => {
  const after = md(FM, "Ver _El beso_, *Otro* y http://x.org/art_revistas/pr_1.\n\n* uno\n* dos\n");
  assert.deepEqual(contentChanges(md(FM), after).errors, []);
});
