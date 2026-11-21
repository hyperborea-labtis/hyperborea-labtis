// The manifest written by scripts/build-images.mjs (git-ignored). Missing in a fresh checkout until
// `npm run dev` / `npm run build` has run it: then every image falls back to its original.
import type { Manifest } from "./images";

const found = import.meta.glob<Manifest>("../data/image-manifest.json", { eager: true, import: "default" });
export const imageManifest: Manifest | undefined = Object.values(found)[0];
