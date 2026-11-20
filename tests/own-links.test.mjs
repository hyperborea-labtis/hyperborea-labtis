import { test } from "node:test";
import assert from "node:assert/strict";
import { relativizeOwnLinks, findOwnLinks } from "../src/lib/own-links.ts";

const rel = relativizeOwnLinks;

test("markdown link to this site becomes a relative path (www or apex, http or https)", () => {
  assert.equal(rel("[a](https://www.hyperborea-labtis.org/es/paper/x)"), "[a](/es/paper/x)");
  assert.equal(rel("[a](https://hyperborea-labtis.org/es/paper/x)"), "[a](/es/paper/x)");
  assert.equal(rel("[a](http://www.hyperborea-labtis.org/en/presentacion)"), "[a](/en/presentacion)");
  assert.equal(rel("[a](HTTPS://WWW.Hyperborea-Labtis.org/es/x)"), "[a](/es/x)");
});

test("the visible text of a link keeps the citation URL; only the destination changes", () => {
  const src = "URL: [https://www.hyperborea-labtis.org/es/paper/x](https://www.hyperborea-labtis.org/es/paper/x)";
  assert.equal(rel(src), "URL: [https://www.hyperborea-labtis.org/es/paper/x](/es/paper/x)");
});

test("angle-bracket and spaced destinations", () => {
  assert.equal(rel("[a](<https://www.hyperborea-labtis.org/es/paper/x>)"), "[a](</es/paper/x>)");
  assert.equal(rel("[a](< https://www.hyperborea-labtis.org/es/paper/x>)"), "[a](</es/paper/x>)");
  assert.equal(rel('[a](https://hyperborea-labtis.org/es/x "título")'), '[a](/es/x "título")');
});

test("html href and src, either quote", () => {
  assert.equal(rel('<a href="https://www.hyperborea-labtis.org/es/x">a</a>'), '<a href="/es/x">a</a>');
  assert.equal(rel("<img src='http://hyperborea-labtis.org/sites/default/files/a.png'>"), "<img src='/sites/default/files/a.png'>");
});

test("query and fragment survive; the bare host becomes the root", () => {
  assert.equal(rel("[a](https://hyperborea-labtis.org/es/buscar?q=x#r)"), "[a](/es/buscar?q=x#r)");
  assert.equal(rel("[a](https://hyperborea-labtis.org)"), "[a](/)");
  assert.equal(rel("[a](https://hyperborea-labtis.org/)"), "[a](/)");
  assert.equal(rel("[a](https://hyperborea-labtis.org#top)"), "[a](/#top)");
});

test("escaped underscores in the path are kept as they are", () => {
  assert.equal(
    rel("[a](https://www.hyperborea-labtis.org/es/criterios\\_y\\_directrices)"),
    "[a](/es/criterios\\_y\\_directrices)",
  );
});

test("an email that was turned into a page link becomes mailto:", () => {
  assert.equal(
    rel("[x@gmail.com](https://www.hyperborea-labtis.org/es/actividad/x@gmail.com)"),
    "[x@gmail.com](mailto:x@gmail.com)",
  );
});

test("other hosts, look-alike hosts and plain text are untouched", () => {
  const same = [
    "[a](https://example.org/es/x)",
    "[a](https://hyperborea-labtis.org.evil.com/x)",
    "[a](https://hyperborea-labtis.org@evil.com/x)",
    "[a](https://hyperborea-labtis.felis.workers.dev/es)",
    "[a](https://hyperborea-labtis.org.ar/x)",
    "see https://www.hyperborea-labtis.org/es/paper/x in the citation",
    "[a](/es/paper/x)",
  ];
  for (const s of same) assert.equal(rel(s), s, s);
});

test("frontmatter sourceUrl (the old Drupal address) is not a link destination and stays", () => {
  const doc = '---\nsourceUrl: "https://hyperborea-labtis.org/es/paper/x"\n---\n\n[a](https://hyperborea-labtis.org/es/paper/y)\n';
  assert.equal(rel(doc), '---\nsourceUrl: "https://hyperborea-labtis.org/es/paper/x"\n---\n\n[a](/es/paper/y)\n');
});

test("idempotent", () => {
  const once = rel("[a](https://www.hyperborea-labtis.org/es/paper/x) <a href='http://hyperborea-labtis.org/es/y'>b</a>");
  assert.equal(rel(once), once);
});

test("findOwnLinks reports exactly what relativizeOwnLinks would change", () => {
  const doc =
    '---\nsourceUrl: "https://hyperborea-labtis.org/es/p"\n---\n[a](https://www.hyperborea-labtis.org/es/x) <a href="http://hyperborea-labtis.org/es/y">b</a> https://www.hyperborea-labtis.org/es/bare [c](/es/z)';
  assert.deepEqual(findOwnLinks(doc), ["https://www.hyperborea-labtis.org/es/x", "http://hyperborea-labtis.org/es/y"]);
  assert.deepEqual(findOwnLinks(rel(doc)), []);
});
