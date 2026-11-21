#!/usr/bin/env node
/**
 * HTTP security headers of the served site, checked on the real responses.
 *
 *   npm run build && npm run check:headers                      # local: wrangler dev --local serves dist/
 *   npm run check:headers -- --base=https://hyperborea-labtis.org   # the live site (run it at launch)
 *
 * Pages: Content-Security-Policy (strict, with frame-ancestors), HSTS, nosniff, X-Frame-Options, Referrer,
 * COOP, Permissions-Policy. /admin: its own policy, no-store, noindex, and the page policy must NOT leak in.
 * Hashed files: immutable. The rules live in src/lib/headers-check.ts (with tests).
 */
import { liveHeaderProblems } from "../src/lib/headers-check.ts";
import { startServer } from "./lib/serve.mjs";

const TARGETS = [
  ["page", "/es"],
  ["page", "/en"],
  ["page", "/fr"],
  ["page", "/es/numero-8"],
  ["page", "/es/paper/aigokeros"],
  ["page", "/es/buscar"],
  ["page", "/es/no-existe-esta-pagina", 404],
  ["admin", "/admin"],
  ["admin", "/admin/config.yml"],
];

const server = await startServer();
let failed = 0;
const lower = (headers) => Object.fromEntries([...headers].map(([k, v]) => [k.toLowerCase(), v]));
try {
  const targets = [...TARGETS];
  // one hashed asset, found through the home page
  const home = await (await fetch(`${server.base}/es`)).text();
  const asset = /href="(\/_astro\/[^"]+\.css)"/.exec(home)?.[1];
  if (asset) targets.push(["immutable", asset]);
  else {
    failed++;
    console.log("✗ no /_astro/*.css found on /es");
  }
  for (const [kind, url, status = 200] of targets) {
    const res = await fetch(server.base + url, { redirect: "manual" });
    const problems = liveHeaderProblems(kind, lower(res.headers));
    if (res.status !== status) problems.unshift(`HTTP ${res.status}, expected ${status}`);
    if (problems.length) {
      failed++;
      console.log(`✗ ${url} (${kind})`);
      for (const p of problems) console.log(`    · ${p}`);
    } else console.log(`✓ ${url} (${kind})`);
  }
} finally {
  server.stop();
}
console.log(failed ? `\n❌ ${failed} URL(s) with header problems` : "\n✅ security headers OK");
process.exit(failed ? 1 : 0);
