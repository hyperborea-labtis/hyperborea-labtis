// Brand assets derived from the journal's logo (public/site/logo-header.gif, 300x80, with the
// round emblem in its left 80x80). PROVISIONAL: the only artwork available is that small GIF,
// so these are crops and enlargements of it. When the client provides a vector logo, replace
// the source below (or the outputs) and run `node scripts/build-brand-assets.mjs` again.
//
// Writes into public/: favicon.ico (16/32/48), favicon-32.png, apple-touch-icon.png (180),
// icon-192.png and icon-512.png (the web app manifest, site.webmanifest) and og-default.png (1200x630, the social card used by pages without their own image).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const PUBLIC = path.join(ROOT, "public");
const LOGO = path.join(PUBLIC, "site", "logo-header.gif");
const EMBLEM = { left: 0, top: 0, width: 80, height: 80 };

const disc = (size) => Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);

/** The emblem as a transparent-cornered disc, `size` px wide. */
async function emblem(size) {
  return sharp(LOGO)
    .extract(EMBLEM)
    .resize(size, size, { kernel: "lanczos3" })
    .ensureAlpha()
    .composite([{ input: disc(size), blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** PNG-in-ICO container (supported by every current browser). */
function ico(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...pngs.map((p) => p.data)]);
}

const write = (name, data) => {
  fs.writeFileSync(path.join(PUBLIC, name), data);
  console.log(`public/${name}  ${data.length} bytes`);
};

write("favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await emblem(size) })))));
write("favicon-32.png", await emblem(32));

// iOS rounds the corners itself: a full-bleed black square with the emblem inset.
write(
  "apple-touch-icon.png",
  await sharp({ create: { width: 180, height: 180, channels: 3, background: "#000000" } })
    .composite([{ input: await emblem(148), gravity: "centre" }])
    .png()
    .toBuffer(),
);

// Web app manifest icons: the same black square with the emblem inset (a 512 px icon from an 80 px logo is
// soft; it improves with the vector logo, like the rest).
for (const size of [192, 512]) {
  write(
    `icon-${size}.png`,
    await sharp({ create: { width: size, height: size, channels: 3, background: "#000000" } })
      .composite([{ input: await emblem(Math.round(size * 0.82)), gravity: "centre" }])
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toBuffer(),
  );
}

// Social card: the full logo, enlarged 3x, centred on black.
const logo3x = await sharp(LOGO).resize(900, 240, { kernel: "lanczos3" }).png().toBuffer();
write(
  "og-default.png",
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#000000" } })
    .composite([{ input: logo3x, left: 150, top: 195 }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
