import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyHasAbstract } from "../src/lib/abstract.ts";

const long = (head) => `${head}\n\n${"Texto del artículo. ".repeat(200)}`;

test("a Resumen / Abstract / Résumé heading near the top counts as the author's own abstract", () => {
  for (const h of ["## Resumen", "## Abstract", "# Résumé", "### **Resumen**", "**Resumen**", "Resumen:", "## RESUMEN"]) {
    assert.equal(bodyHasAbstract(long(`${h}\n\nEl artículo examina…`)), true, h);
  }
});

test("a body without one does not", () => {
  assert.equal(bodyHasAbstract(long("Primer párrafo del artículo.")), false);
  assert.equal(bodyHasAbstract(""), false);
});

test("the word only counts when it is a heading, not inside running text", () => {
  assert.equal(bodyHasAbstract(long("El resumen de esta tesis es largo y el abstract también.")), false);
  assert.equal(bodyHasAbstract(long("Resumenes de la historia")), false);
});

test("one far below the introduction (a section of the article) does not count", () => {
  const body = `${"Texto del artículo. ".repeat(400)}\n\n## Resumen de las conclusiones\n\nFin.`;
  assert.equal(bodyHasAbstract(body), false);
});
