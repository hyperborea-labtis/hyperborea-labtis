import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText, firstParagraph, truncateAtSentence, pageTitle, tidy } from "../src/lib/meta-text.ts";
import {
  textDescription, keywordTitle, withPage, siteTitle, siteDescription, issueDescription, sectionDescription, keywordDescription, paperDescription, pageSuffix,
} from "../src/lib/descriptions.ts";

test("plainText strips Markdown, HTML, footnote markers and escapes", () => {
  assert.equal(plainText("Texto con [enlace](https://a.example/x) y *énfasis* y **negrita**."), "Texto con enlace y énfasis y negrita.");
  assert.equal(plainText("Llamada a nota.[\\[1\\]](#01) Sigue el texto."), "Llamada a nota. Sigue el texto.");
  assert.equal(plainText('<a id="04"></a>Un párrafo <em>con</em> HTML.'), "Un párrafo con HTML.");
  assert.equal(plainText("![alt](/a.jpg) Pie"), "Pie");
  assert.equal(plainText("## Un título\n\nTexto"), "Un título Texto");
  assert.equal(plainText("Cita \\*literal\\* y 1\\. punto"), "Cita *literal* y 1. punto");
  assert.equal(plainText("a\n\n* * *\n\nb"), "a b");
  assert.equal(plainText("Sello Overol (http://edicionesoverol.cl/) en cuya propuesta"), "Sello Overol en cuya propuesta");
  assert.equal(plainText("Ver <https://a.example/x> para más"), "Ver para más");
});

test("firstParagraph skips headings, signatures and short lines", () => {
  const md = [
    "## Videoinstalación Don Quijote",
    "",
    "© Ebba Sund \\[1\\]",
    "",
    "* * *",
    "",
    "Advertencia: escribimos este texto, no como una sucesión de párrafos, sino como un laberinto de hipervínculos que no siempre llevan a alguna parte.",
    "",
    "Otro párrafo largo que no debe elegirse porque el primero ya es válido para describir la página.",
  ].join("\n");
  assert.match(firstParagraph(md), /^Advertencia: escribimos este texto/);
  assert.equal(firstParagraph("## Solo titulo\n\ncorto"), "");
  const intro = "Disponible durante 48 horas a partir del sábado 30 de mayo de 2020 en el siguiente enlace:";
  assert.equal(firstParagraph(intro + "\n\n[https://a.example/x](https://a.example/x)"), "");
});

test("truncateAtSentence prefers a sentence end, else a word boundary with an ellipsis", () => {
  const long = "Primera oración completa que ocupa buen espacio dentro del límite permitido. Segunda oración que se pasa del límite y debe quedar fuera de la descripción final.";
  assert.equal(truncateAtSentence(long, 100), "Primera oración completa que ocupa buen espacio dentro del límite permitido.");
  const noStop = "palabra ".repeat(40).trim();
  const out = truncateAtSentence(noStop, 50);
  assert.ok(out.length <= 50, out);
  assert.ok(out.endsWith("…"), out);
  assert.ok(!/\s…$/.test(out), out);
  assert.equal(truncateAtSentence("Corta.", 155), "Corta.");
});

test("pageTitle appends the brand only while the result stays short", () => {
  assert.equal(pageTitle("Número 8"), "Número 8 | Hyperborea");
  const long = "La configuración iconográfica de la cautiva: del esteticismo romántico a la construcción ideológica del imaginario nacional argentino";
  assert.equal(pageTitle(long), long);
});

test("site title and description exist in every language, within search-result length", () => {
  for (const l of ["es", "en", "fr"]) {
    assert.ok(siteTitle(l).startsWith("Hyperborea"), l);
    const d = siteDescription(l);
    assert.ok(d.length >= 100 && d.length <= 160, `${l} ${d.length}: ${d}`);
  }
});

test("issue, section and keyword descriptions use real data and the language", () => {
  assert.match(issueDescription("es", { n: 8, year: 2025, count: 12 }), /8.*2025.*12/);
  assert.match(issueDescription("en", { n: 8, year: 2025, count: 12 }), /Issue 8.*2025.*12/);
  assert.match(sectionDescription("fr", { label: "Kino LabTIS", count: 4 }), /Kino LabTIS/);
  assert.equal(keywordDescription("es", { name: "Borges", count: 1 }), "1 artículo de Hyperborea, revista de ensayo y creación, con la palabra clave «Borges».");
  assert.equal(keywordDescription("es", { name: "Borges", count: 3 }), "3 artículos de Hyperborea, revista de ensayo y creación, con la palabra clave «Borges».");
  assert.match(keywordDescription("en", { name: "Borges", count: 3 }), /3 articles.*“Borges”/);
  assert.match(keywordDescription("fr", { name: "Borges", count: 1 }), /1 article/);
});

test("paperDescription: abstract first, then the body's first paragraph, then author and issue", () => {
  const abstract = "Este artículo explora una paradoja que caracteriza a la cultura visual fin-de-siècle: el advenimiento de nuevas tecnologías ópticas prometía una visión más clara.";
  const withAbstract = paperDescription("es", { abstract, body: "## T\n\ncuerpo", author: "Ana", issue: 8 });
  assert.ok(withAbstract.startsWith("Este artículo explora"));
  assert.ok(withAbstract.length <= 160);
  const body = "## Título\n\nUn comienzo de texto suficientemente largo para servir como descripción cuando el paper no tiene resumen cargado en el sistema.";
  assert.match(paperDescription("es", { body, author: "Ana", issue: 8 }), /^Un comienzo de texto/);
  assert.match(paperDescription("es", { body: "## Título", author: "Ana Pérez", issue: 8 }), /Hyperborea 8.*Ana Pérez/);
  assert.match(paperDescription("en", { body: "", issue: 8 }), /Hyperborea 8/);
});

test("pageSuffix numbers paginated titles", () => {
  assert.equal(pageSuffix("es", 2), "Página 2");
  assert.equal(pageSuffix("en", 3), "Page 3");
  assert.equal(pageSuffix("fr", 2), "Page 2");
});

test("textDescription: title + first paragraph, no repeated title, fallback to title + site", () => {
  const body = "Organizado en el marco del Proyecto de Investigación Plurianual sobre interrelaciones entre literatura y artes visuales.";
  const d = textDescription("es", { body, title: "II Simposio Texto, imagen & sociedad" });
  assert.ok(d.startsWith("II Simposio Texto, imagen & sociedad. Organizado"), d);
  assert.ok(d.length <= 160, d);
  const same = textDescription("es", { body: "Jornadas en el 200º aniversario de la muerte de Joseph de Maistre, con distintas mesas de trabajo.", title: "Jornadas en el 200º aniversario" });
  assert.ok(same.startsWith("Jornadas en el 200º aniversario de la muerte"), same);
  const none = textDescription("en", { body: "corto", title: "Contact" });
  assert.ok(none.startsWith("Contact. Annual digital journal"), none);
});

test("keywordTitle and withPage keep titles and descriptions of similar pages apart", () => {
  assert.equal(keywordTitle("es", "Borges"), "Palabra clave: Borges");
  assert.equal(keywordTitle("en", "Borges"), "Keyword: Borges");
  assert.equal(keywordTitle("fr", "Borges"), "Mot-clé : Borges");
  assert.equal(withPage("Descripción.", "es", 1), "Descripción.");
  assert.equal(withPage("Descripción.", "es", 3), "Descripción. (Página 3)");
  assert.equal(withPage("Description.", "en", 2), "Description. (Page 2)");
});

test("tidy collapses the doubled spaces that came with some Drupal titles", () => {
  assert.equal(tidy("El enfoque:  la representación  de la mujer "), "El enfoque: la representación de la mujer");
});

test("a word-boundary cut never ends on a dangling function word", () => {
  const text = "Este artículo explora una paradoja que caracteriza a la cultura visual: el advenimiento de nuevas tecnologías ópticas prometió mayor claridad y profundidad";
  for (const max of [120, 130, 140, 150]) {
    const out = truncateAtSentence(text, max);
    assert.ok(out.length <= max, out);
    assert.ok(!/\s(?:y|e|o|de|del|la|el|los|las|que|en|a|con|por|para|un|una|and|of|the|et|du|le)…$/i.test(out), out);
  }
  // the cut lands inside "profundidad", just after "claridad y": the dangling "y" must go too
  const cutInside = text.indexOf("profundidad") + 4;
  assert.match(truncateAtSentence(text, cutInside + 1), /mayor claridad…$/);
});

test("issue description reads naturally in English", () => {
  assert.match(issueDescription("en", { n: 8, year: 2025, count: 14 }), /14 articles, essays and creative work/);
});
