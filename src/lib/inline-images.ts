// Images inside the text of a paper or page (the Markdown body). They are written once by the editors
// (or imported from Drupal) as plain `<img src="/sites/default/files/…">`; at build time the Markdown
// plugin src/plugins/images.mjs gives each one what the page needs, using the manifest from
// scripts/build-images.mjs:
//   - WebP variants (srcset/sizes) and a mid-size `src`, so a 4 MB PNG is not sent to a phone;
//   - its real width and height when the markup has none (no layout shift while it loads);
//   - loading="lazy" decoding="async" (an author's own `loading` wins).
// Images the manifest does not know, GIFs (may be animated: no variants) and external ones stay as they were.
// The plugin runs AFTER the sanitizer and only adds values built here: /_img paths and numbers.

import { IMG_DIR, manifestKey, type Manifest, type Variant } from "./images.ts";

/** Column the text is drawn in on a wide screen (page 1170 − padding; article padding 100 each side). */
const COLUMN = 940;
/** Page and article padding on a phone: the column is the viewport minus this. */
const GUTTER = 78;

export type Attrs = Record<string, string>;

export function enhanceImgAttrs(attrs: Attrs, manifest: Manifest | undefined): Attrs {
  const src = attrs.src;
  const entry = src ? manifest?.[manifestKey(src)] : undefined;
  if (!src || !entry) return attrs;
  const out: Attrs = { ...attrs };
  // The size it is SHOWN at: what the markup says, else its natural width squeezed into the column.
  const shown = Number(attrs.width) > 0 ? Number(attrs.width) : Math.min(entry.width, COLUMN);
  if (!out.width && !out.height) {
    out.width = String(entry.width);
    out.height = String(entry.height);
  }
  const variants: Variant[] | undefined = entry.hero;
  if (variants?.length) {
    const url = (v: Variant) => `${IMG_DIR}/${v.file}`;
    const fallback = [...variants].reverse().find((v) => v.width <= 960) ?? variants[0];
    out.src = url(fallback);
    out.srcset = variants.map((v) => `${url(v)} ${v.width}w`).join(", ");
    out.sizes = `(max-width: ${shown + GUTTER}px) calc(100vw - ${GUTTER}px), ${shown}px`;
  }
  out.loading ??= "lazy";
  out.decoding ??= "async";
  return out;
}

const IMG_TAG = /<img\b([^>]*?)(\/?)>/gi;
const ATTR = /([^\s"'<>/=]+)(?:="([^"]*)")?/g;

/** Rewrites every <img> of a piece of HTML (attribute order kept, other markup untouched). */
export function enhanceImgTags(html: string, manifest: Manifest | undefined): string {
  if (!manifest) return html;
  return html.replace(IMG_TAG, (whole, rest: string, slash: string) => {
    const attrs: Attrs = {};
    for (const m of rest.matchAll(ATTR)) attrs[m[1].toLowerCase()] = m[2] ?? "";
    const out = enhanceImgAttrs(attrs, manifest);
    if (out === attrs) return whole;
    return `<img ${Object.entries(out).map(([k, v]) => `${k}="${v}"`).join(" ")}${slash}>`;
  });
}
