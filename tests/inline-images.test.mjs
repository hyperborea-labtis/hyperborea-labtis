import { test } from "node:test";
import assert from "node:assert/strict";
import { enhanceImgAttrs, enhanceImgTags } from "../src/lib/inline-images.ts";

const v = (w, h) => ({ file: `fig-hero${w}-aaaaaaaa.webp`, width: w, height: h });
const manifest = {
  "/sites/default/files/inline-images/fig5.jpg": { width: 2000, height: 1500, hero: [v(480, 360), v(720, 540), v(960, 720), v(1440, 1080)] },
  "/sites/default/files/inline-images/anim.gif": { width: 300, height: 200 },
  "/sites/default/files/inline-images/with space.jpg": { width: 1000, height: 500, hero: [v(480, 240), v(720, 360), v(960, 480)] },
};

test("an inline image gets WebP variants, its real size, and lazy loading", () => {
  const out = enhanceImgAttrs({ alt: "Fig", src: "/sites/default/files/inline-images/fig5.jpg" }, manifest);
  assert.equal(out.src, "/_img/fig-hero960-aaaaaaaa.webp");
  assert.equal(out.srcset, "/_img/fig-hero480-aaaaaaaa.webp 480w, /_img/fig-hero720-aaaaaaaa.webp 720w, /_img/fig-hero960-aaaaaaaa.webp 960w, /_img/fig-hero1440-aaaaaaaa.webp 1440w");
  assert.equal(out.width, "2000");
  assert.equal(out.height, "1500");
  assert.equal(out.loading, "lazy");
  assert.equal(out.decoding, "async");
  assert.equal(out.alt, "Fig");
  assert.match(out.sizes, /940px/);
});

test("width and height the author (or the import) gave are kept: they are the size the picture is shown at", () => {
  const out = enhanceImgAttrs({ alt: "", src: "/sites/default/files/inline-images/fig5.jpg", width: "518", height: "389" }, manifest);
  assert.equal(out.width, "518");
  assert.equal(out.height, "389");
  assert.match(out.sizes, /518px/);
});

test("an author's own loading attribute wins", () => {
  const out = enhanceImgAttrs({ alt: "", src: "/sites/default/files/inline-images/fig5.jpg", loading: "eager" }, manifest);
  assert.equal(out.loading, "eager");
});

test("a GIF (no variants: it may be animated) only gains its real size and lazy loading", () => {
  const out = enhanceImgAttrs({ alt: "", src: "/sites/default/files/inline-images/anim.gif" }, manifest);
  assert.equal(out.src, "/sites/default/files/inline-images/anim.gif");
  assert.equal(out.srcset, undefined);
  assert.equal(out.width, "300");
  assert.equal(out.height, "200");
  assert.equal(out.loading, "lazy");
});

test("an image the manifest does not know, or an external one, is left exactly as it was", () => {
  const same = { alt: "x", src: "/sites/default/files/inline-images/new.jpg" };
  assert.deepEqual(enhanceImgAttrs(same, manifest), same);
  const ext = { alt: "x", src: "https://example.org/a.jpg" };
  assert.deepEqual(enhanceImgAttrs(ext, manifest), ext);
  assert.deepEqual(enhanceImgAttrs(same, undefined), same);
});

test("URL-encoded paths find their manifest entry", () => {
  const out = enhanceImgAttrs({ alt: "", src: "/sites/default/files/inline-images/with%20space.jpg" }, manifest);
  assert.match(out.src, /^\/_img\//);
});

test("enhanceImgTags rewrites every <img> in a piece of HTML and nothing else", () => {
  const html = '<figure class="caption"><img alt="Fig 5" height="389" src="/sites/default/files/inline-images/fig5.jpg" width="518"><figcaption>Fig. 5 <a href="/sites/default/files/inline-images/fig5.jpg">original</a></figcaption></figure>';
  const out = enhanceImgTags(html, manifest);
  assert.match(out, /<img [^>]*srcset="\/_img\/fig-hero480-aaaaaaaa\.webp 480w/);
  assert.match(out, /width="518"/);
  assert.ok(out.includes('<a href="/sites/default/files/inline-images/fig5.jpg">original</a>'), "links to the original keep pointing at it");
  assert.ok(out.startsWith('<figure class="caption">') && out.endsWith("</figcaption></figure>"));
  assert.equal(enhanceImgTags("<p>no images</p>", manifest), "<p>no images</p>");
});

test("the result stays inside the sanitizer's guarantees: only /_img paths and numeric sizes are ever added", () => {
  const out = enhanceImgTags('<img alt="a&quot;b" src="/sites/default/files/inline-images/fig5.jpg">', manifest);
  assert.ok(!/javascript:|on\w+=/i.test(out));
  for (const m of out.matchAll(/(?:src|srcset)="([^"]*)"/g)) assert.ok(/^\/_img\/[\w.\-]+\.webp( \d+w)?(, \/_img\/[\w.\-]+\.webp \d+w)*$/.test(m[1]), m[1]);
});
