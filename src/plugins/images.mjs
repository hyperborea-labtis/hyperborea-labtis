// Responsive inline images (Sätteri hast plugin, Astro's Markdown processor).
//
// Gives every `<img>` of a paper's or page's text its WebP variants, real size and lazy loading, from the
// manifest that scripts/build-images.mjs writes. The rules live in src/lib/inline-images.ts (with tests).
// Order matters: it runs AFTER the sanitizer, which would drop `srcset`/`sizes`; what is added here is only
// built from the manifest (paths under /_img, numbers), never from the author's text.

import fs from "node:fs";
import { enhanceImgAttrs, enhanceImgTags } from "../lib/inline-images.ts";

const MANIFEST = new URL("../data/image-manifest.json", import.meta.url);

/** @type {import("../lib/images.ts").Manifest | undefined | null} */
let cached = null;
function loadManifest() {
  if (cached !== null) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    cached = undefined; // no manifest yet (fresh checkout): images stay as they are
  }
  return cached;
}

/**
 * @param {any} node
 * @param {(n: any) => void} fn
 */
const walk = (node, fn) => {
  fn(node);
  if (node.children) for (const c of node.children) walk(c, fn);
};

const STRING_PROPS = ["src", "width", "height", "loading", "decoding"];

/**
 * @param {() => import("../lib/images.ts").Manifest | undefined} getManifest
 * @returns {import("satteri").HastPluginDefinition}
 */
export const imagesWith = (getManifest) => ({
  name: "images",
  before(root, ctx) {
    const manifest = getManifest();
    if (!manifest) return;
    walk(root, (n) => {
      if (n.type === "raw" && typeof n.value === "string" && n.value.includes("<img")) {
        const next = enhanceImgTags(n.value, manifest);
        if (next !== n.value) ctx.replaceNode(n, { type: "raw", value: next });
      } else if (n.type === "element" && n.tagName === "img") {
        const props = n.properties ?? {};
        /** @type {Record<string, string>} */
        const attrs = {};
        for (const k of STRING_PROPS) if (props[k] !== undefined && props[k] !== null) attrs[k] = String(props[k]);
        const out = enhanceImgAttrs(attrs, manifest);
        if (out === attrs) return;
        for (const [k, v] of Object.entries(out)) {
          if (attrs[k] === v) continue;
          ctx.setProperty(n, k === "srcset" ? "srcSet" : k, v);
        }
      }
    });
  },
});

export const images = imagesWith(loadManifest);
