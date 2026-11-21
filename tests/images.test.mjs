import { test } from "node:test";
import assert from "node:assert/strict";
import { planVariants, variantFileName, describeImage, IMG_DIR, CARD_WIDTHS, HERO_WIDTHS } from "../src/lib/images.ts";

test("card variants are 3:2 crops (what the cards show), never wider than the largest 3:2 box inside the original", () => {
  // landscape original: the crop is as wide as the original allows
  assert.deepEqual(planVariants({ width: 3000, height: 1500 }, "card"), CARD_WIDTHS.map((w) => ({ width: w, height: w * 2 / 3 })));
  // portrait original 600x1000: the 3:2 box is 600x400, so 480 fits and 960 does not
  assert.deepEqual(planVariants({ width: 600, height: 1000 }, "card"), [{ width: 480, height: 320 }, { width: 600, height: 400 }]);
  // tiny original: one variant, at the size the original allows (never upscaled)
  assert.deepEqual(planVariants({ width: 300, height: 200 }, "card"), [{ width: 300, height: 200 }]);
});

test("hero variants keep the original aspect and never upscale", () => {
  assert.deepEqual(planVariants({ width: 3000, height: 1500 }, "hero").map((v) => v.width), HERO_WIDTHS);
  assert.deepEqual(planVariants({ width: 3000, height: 1500 }, "hero")[0], { width: 480, height: 240 });
  assert.deepEqual(planVariants({ width: 1000, height: 500 }, "hero").map((v) => v.width), [480, 720, 960]);
  assert.deepEqual(planVariants({ width: 400, height: 300 }, "hero"), [{ width: 400, height: 300 }]);
});

test("file names carry the width and a content hash (immutable caching), and are plain ASCII", () => {
  assert.equal(variantFileName("/sites/default/files/ct-paper/Captura de pantalla (1).PNG", "card", 480, "abcdef1234567890"), "captura-de-pantalla-1-card480-abcdef12.webp");
  assert.equal(variantFileName("/sites/default/files/ct-articles/ñandú.jpg", "hero", 960, "0123456789abcdef"), "nandu-hero960-01234567.webp");
});

const manifest = {
  "/sites/default/files/ct-paper/a.png": {
    width: 3000,
    height: 2000,
    card: [{ file: "a-card480-aaaaaaaa.webp", width: 480, height: 320 }, { file: "a-card960-aaaaaaaa.webp", width: 960, height: 640 }],
    hero: [{ file: "a-hero480-aaaaaaaa.webp", width: 480, height: 320 }, { file: "a-hero960-aaaaaaaa.webp", width: 960, height: 640 }, { file: "a-hero1440-aaaaaaaa.webp", width: 1440, height: 960 }],
  },
};

test("describeImage: srcset lists every variant under the optimised path; src is a mid-size variant, never the original", () => {
  const d = describeImage(manifest, "/sites/default/files/ct-paper/a.png", "card");
  assert.equal(d.srcset, `${IMG_DIR}/a-card480-aaaaaaaa.webp 480w, ${IMG_DIR}/a-card960-aaaaaaaa.webp 960w`);
  assert.equal(d.src, `${IMG_DIR}/a-card960-aaaaaaaa.webp`);
  assert.deepEqual([d.width, d.height], [960, 640]);
  const h = describeImage(manifest, "/sites/default/files/ct-paper/a.png", "hero");
  assert.equal(h.src, `${IMG_DIR}/a-hero960-aaaaaaaa.webp`);
  assert.equal(h.srcset.split(", ").length, 3);
});

test("describeImage: an image that was not processed (or a missing manifest) returns null so the caller uses the original", () => {
  assert.equal(describeImage(manifest, "/sites/default/files/other.png", "card"), null);
  assert.equal(describeImage({}, "/x.png", "hero"), null);
  assert.equal(describeImage(undefined, "/x.png", "hero"), null);
});

test("the optimised path is outside /sites (Cloudflare joins Cache-Control of every matching rule)", () => {
  assert.ok(!IMG_DIR.startsWith("/sites"));
  assert.match(IMG_DIR, /^\/_img$/);
});
