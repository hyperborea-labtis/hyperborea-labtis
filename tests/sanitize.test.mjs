import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "satteri";
import { sanitizeHtml, isSafeUrl, sanitize } from "../src/plugins/sanitize.mjs";
import { footnotes } from "../src/plugins/footnotes.mjs";

const render = async (md) => {
  const r = await markdownToHtml(md, { hastPlugins: [sanitize, footnotes] });
  return typeof r === "string" ? r : r.html;
};

test("drops script/style/iframe blocks with their content", () => {
  assert.equal(sanitizeHtml("a<script>alert(1)</script>b"), "ab");
  assert.equal(sanitizeHtml('<iframe src="https://evil.example"></iframe>x'), "x");
  assert.equal(sanitizeHtml("<style>body{display:none}</style>x"), "x");
  assert.equal(sanitizeHtml("<SCRIPT\n>alert(1)</SCRIPT >x"), "x");
  assert.equal(sanitizeHtml("<svg onload=alert(1)><circle/></svg>x"), "x");
});

test("removes event handlers and style, keeps safe attributes", () => {
  assert.equal(sanitizeHtml('<img src="/a.jpg" onerror="alert(1)" alt="x">'), '<img src="/a.jpg" alt="x">');
  assert.equal(sanitizeHtml('<td style="vertical-align: bottom;" colspan="2">x</td>'), '<td colspan="2">x</td>');
  assert.equal(sanitizeHtml("<p onclick=alert(1) id=n>x</p>"), '<p id="n">x</p>');
});

test("rejects dangerous URLs, including obfuscated schemes", () => {
  for (const bad of [
    "javascript:alert(1)",
    " JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "&#106;avascript:alert(1)",
    "&#x6A;avascript:alert(1)",
    "javascript&colon;alert(1)",
    "java&Tab;script:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:x",
    "jav&#x0A;ascript:alert(1)",
  ]) {
    assert.equal(isSafeUrl(bad), false, bad);
    assert.equal(sanitizeHtml(`<a href="${bad}">x</a>`), "<a>x</a>", bad);
  }
  for (const ok of ["/es/paper/x", "#01", "?page=2", "https://a.example/?a=1&b=2", "http://a.example", "mailto:a@b.co", "tel:+54123", "relativo/x.html", "../x"]) {
    assert.equal(isSafeUrl(ok), true, ok);
  }
});

test("data: only for images", () => {
  assert.equal(sanitizeHtml('<img src="data:image/png;base64,AAAA">'), '<img src="data:image/png;base64,AAAA">');
  assert.equal(sanitizeHtml('<img src="data:text/html;base64,AAAA">'), "<img>");
  assert.equal(sanitizeHtml('<a href="data:image/png;base64,AAAA">x</a>'), "<a>x</a>");
});

test("keeps the markup the content really uses", () => {
  const html =
    '<figure role="group" class="caption caption-img align-center"><img alt="Figura 4" data-entity-type="file" data-entity-uuid="163420b3" height="389" src="/sites/default/files/inline-images/fig4.jpg" width="518"><figcaption>Fig. 4</figcaption></figure>';
  assert.equal(sanitizeHtml(html), html);
  assert.equal(sanitizeHtml('<a id="04"></a>'), '<a id="04"></a>');
  const table = '<table align="center" border="0" cellpadding="1" cellspacing="10"><tbody><tr><td colspan="2"><em>x</em></td></tr></tbody></table>';
  assert.equal(sanitizeHtml(table), table);
});

test("target=_blank gets rel=noopener noreferrer", () => {
  assert.equal(
    sanitizeHtml('<a href="https://a.example" target="_blank">x</a>'),
    '<a href="https://a.example" target="_blank" rel="noopener noreferrer">x</a>',
  );
});

test("strips comments, doctype, php and keeps stray < as text", () => {
  assert.equal(sanitizeHtml("a<!-- c -->b<!DOCTYPE html>c<?php x ?>d"), "abcd");
  assert.equal(sanitizeHtml("1 < 2"), "1 &lt; 2");
  assert.ok(!/<script/i.test(sanitizeHtml("<scr<script>ipt>alert(1)</scr</script>ipt>")));
});

test("is idempotent", () => {
  const dirty = '<p onclick="x" style="a:b">a <script>x</script><img src=y onerror=z> <a href="javascript:1" target=_blank>q</a> 1 < 2</p>';
  const once = sanitizeHtml(dirty);
  assert.equal(sanitizeHtml(once), once);
});

test("pipeline: raw inline script split across nodes is removed with its content", async () => {
  const out = await render("Hola <script>alert(1)</script> fin\n");
  assert.ok(!out.includes("<script"), out);
  assert.ok(!out.includes("alert(1)"), out);
  assert.ok(out.includes("Hola") && out.includes("fin"), out);
});

test("pipeline: javascript: links and onerror images from Markdown/raw HTML are neutralised", async () => {
  const out = await render('[x](javascript:alert(3)) <img src=x onerror=alert(2)>\n\n<div onclick="x()"><p style="color:red">bloque</p></div>\n');
  assert.ok(!/javascript:/i.test(out), out);
  assert.ok(!/onerror|onclick|style=/i.test(out), out);
  assert.ok(out.includes("bloque"), out);
});

test("pipeline: normal Markdown and footnote anchors still work", async () => {
  const out = await render("Texto con [enlace](https://a.example/x) y nota.[\\[1\\]](#01)\n\n\\[1\\] La nota.\n");
  assert.ok(out.includes('<a href="https://a.example/x">enlace</a>'), out);
  assert.ok(out.includes('<p id="01">'), out);
});
