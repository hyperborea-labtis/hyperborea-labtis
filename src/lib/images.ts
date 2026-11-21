// Responsive images. The originals in public/sites/ keep their URLs (they are what the old Drupal site
// served, and what og:image, JSON-LD and citation_* point at); what pages SHOW are WebP variants that
// scripts/build-images.mjs generates into public/_img/ and lists in src/data/image-manifest.json.
//
//  - card:  3:2 crops (cards show every picture at aspect-ratio 3/2), widths 480, 720 and 960
//  - hero:  original aspect, widths 480, 720, 960 and 1440 (the article column is under 1000 CSS px wide;
//           1440 covers a 1.5x screen). 720 is what a phone (1.75x) needs for a ~370 px column.
// A variant is never larger than its original. Variants live in /_img, NOT under /sites: Cloudflare joins
// the Cache-Control of every `_headers` rule that matches, so /sites/* (a week) and an immutable year
// cannot share a prefix. The file name carries a content hash, which is what makes "immutable" safe.

export const IMG_DIR = "/_img";
export const CARD_WIDTHS = [480, 720, 960];
export const HERO_WIDTHS = [480, 720, 960, 1440];
/** A variant this close to the previous one is not worth a file. */
const MIN_STEP = 60;

export type ImageKind = "card" | "hero";
export interface Size {
  width: number;
  height: number;
}
export interface Variant extends Size {
  file: string;
}
export interface ManifestEntry extends Size {
  card?: Variant[];
  hero?: Variant[];
}
export type Manifest = Record<string, ManifestEntry>;

/** Manifest keys are decoded paths: `with%20space.jpg` and `with space.jpg` are the same file. */
export function manifestKey(source: string): string {
  try {
    return decodeURIComponent(source.split("?")[0]);
  } catch {
    return source.split("?")[0];
  }
}

/** The variants to produce for an original of this size. */
export function planVariants(original: Size, kind: ImageKind): Size[] {
  const targets = kind === "card" ? CARD_WIDTHS : HERO_WIDTHS;
  // The widest variant the original allows: a card crops 3:2, so portrait originals give a smaller box.
  const max = kind === "card" ? Math.min(original.width, Math.floor(original.height * 1.5)) : original.width;
  const widths = targets.filter((w) => w <= max);
  const last = widths[widths.length - 1];
  if (last === undefined) widths.push(max);
  else if (max < targets[targets.length - 1] && max - last >= MIN_STEP) widths.push(max);
  const ratio = kind === "card" ? 2 / 3 : original.height / original.width;
  return widths.map((width) => ({ width, height: Math.round(width * ratio) }));
}

/** Plain ASCII name with the width and the first 8 characters of the content hash. */
export function variantFileName(source: string, kind: ImageKind, width: number, hash: string): string {
  const base = decodeURIComponent(source).split("/").pop()!.replace(/\.[a-z0-9]+$/i, "");
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "img"}-${kind}${width}-${hash.slice(0, 8)}.webp`;
}

export interface ImageAttrs {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

/** The attributes of an <img> for this original, or null when it has no variants (use the original then). */
export function describeImage(manifest: Manifest | undefined, source: string, kind: ImageKind): ImageAttrs | null {
  const variants = manifest?.[manifestKey(source)]?.[kind];
  if (!variants?.length) return null;
  const url = (v: Variant) => `${IMG_DIR}/${v.file}`;
  // A browser that ignores srcset gets a mid-size file, never the original.
  const fallback = [...variants].reverse().find((v) => v.width <= 960) ?? variants[0];
  return {
    src: url(fallback),
    srcset: variants.map((v) => `${url(v)} ${v.width}w`).join(", "),
    width: fallback.width,
    height: fallback.height,
  };
}
