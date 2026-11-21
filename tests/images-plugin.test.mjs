import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "satteri";
import { sanitize } from "../src/plugins/sanitize.mjs";
import { imagesWith } from "../src/plugins/images.mjs";

const v = (w, h) => ({ file: `fig-hero${w}-aaaaaaaa.webp`, width: w, height: h });
const manifest = {
  "/sites/default/files/inline-images/fig5.jpg": { width: 2000, height: 1500, hero: [v(480, 360), v(960, 720)] },
};
const render = async (md, getManifest = () => manifest) => {
  const r = await markdownToHtml(md, { hastPlugins: [sanitize, imagesWith(getManifest)] });
  return typeof r === "string" ? r : r.html;
};

test("pipeline: a Markdown image gets srcset, sizes, real size and lazy loading", async () => {
  const out = await render("![Figura 5](/sites/default/files/inline-images/fig5.jpg)\n");
  assert.match(out, /srcset="\/_img\/fig-hero480-aaaaaaaa\.webp 480w, \/_img\/fig-hero960-aaaaaaaa\.webp 960w"/i);
  assert.match(out, /src="\/_img\/fig-hero960-aaaaaaaa\.webp"/);
  assert.match(out, /width="2000"/);
  assert.match(out, /height="1500"/);
  assert.match(out, /loading="lazy"/);
  assert.match(out, /alt="Figura 5"/);
});

test("pipeline: a raw <img> (what the Drupal import wrote) survives the sanitizer and is enhanced after it", async () => {
  const out = await render('<figure class="caption"><img alt="Fig 5" height="389" src="/sites/default/files/inline-images/fig5.jpg" width="518"><figcaption>x</figcaption></figure>\n');
  assert.match(out, /srcset="/i);
  assert.match(out, /width="518"/);
  assert.match(out, /height="389"/);
});

test("pipeline: the author cannot smuggle srcset/sizes through the sanitizer (it still drops them)", async () => {
  const out = await render('<img alt="x" src="/sites/default/files/other.jpg" srcset="https://evil.example/a.png 1x" sizes="100vw" onerror="alert(1)">\n');
  assert.ok(!/evil\.example|srcset|onerror/i.test(out), out);
});

test("pipeline: without a manifest the page renders exactly as before", async () => {
  const out = await render("![x](/sites/default/files/inline-images/fig5.jpg)\n", () => undefined);
  assert.ok(!/srcset|loading=/i.test(out), out);
  assert.match(out, /src="\/sites\/default\/files\/inline-images\/fig5\.jpg"/);
});
