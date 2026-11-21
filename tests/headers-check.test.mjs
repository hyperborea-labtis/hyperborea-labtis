import { test } from "node:test";
import assert from "node:assert/strict";
import { liveHeaderProblems } from "../src/lib/headers-check.ts";

const PAGE_CSP =
  "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-AAA='; style-src 'self'";
const page = () => ({
  "content-security-policy": `frame-ancestors 'none', ${PAGE_CSP}`,
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "permissions-policy": "browsing-topics=(), camera=(), microphone=()",
});

test("a page with every header is fine", () => {
  assert.deepEqual(liveHeaderProblems("page", page()), []);
});

test("page: each missing or weak header is reported by name", () => {
  const without = (name) => {
    const h = page();
    delete h[name];
    return liveHeaderProblems("page", h).join();
  };
  assert.match(without("content-security-policy"), /content-security-policy/i);
  assert.match(without("strict-transport-security"), /strict-transport-security/i);
  assert.match(without("x-content-type-options"), /x-content-type-options/i);
  assert.match(without("x-frame-options"), /x-frame-options/i);
  assert.match(without("referrer-policy"), /referrer-policy/i);
  assert.match(without("cross-origin-opener-policy"), /cross-origin-opener-policy/i);
  assert.match(without("permissions-policy"), /permissions-policy/i);
});

test("page: HSTS must last a year, cover subdomains and must NOT ask for preload yet", () => {
  const h = (v) => ({ ...page(), "strict-transport-security": v });
  assert.match(liveHeaderProblems("page", h("max-age=3600; includeSubDomains")).join(), /max-age/);
  assert.match(liveHeaderProblems("page", h("max-age=31536000")).join(), /includeSubDomains/);
  assert.match(liveHeaderProblems("page", h("max-age=31536000; includeSubDomains; preload")).join(), /preload/);
});

test("page: the policy must be strict and must not be only frame-ancestors", () => {
  const only = { ...page(), "content-security-policy": "frame-ancestors 'none'" };
  assert.match(liveHeaderProblems("page", only).join(), /script-src|default-src/);
  const loose = { ...page(), "content-security-policy": PAGE_CSP.replace("'sha256-AAA='", "'unsafe-inline'") };
  assert.match(liveHeaderProblems("page", loose).join(), /unsafe-inline/);
  const noAncestors = { ...page(), "content-security-policy": PAGE_CSP };
  assert.match(liveHeaderProblems("page", noAncestors).join(), /frame-ancestors/);
});

test("page: permissions-policy keeps the sensors off and opts out of topics", () => {
  const h = { ...page(), "permissions-policy": "camera=()" };
  assert.match(liveHeaderProblems("page", h).join(), /browsing-topics/);
});

const ADMIN_CSP =
  "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const admin = () => ({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "content-security-policy": `frame-ancestors 'none', ${ADMIN_CSP}` });

test("admin: no-store, noindex and the CMS's own policy", () => {
  assert.deepEqual(liveHeaderProblems("admin", admin()), []);
  assert.match(liveHeaderProblems("admin", { ...admin(), "cache-control": "public, max-age=60" }).join(), /no-store/);
  assert.match(liveHeaderProblems("admin", { ...admin(), "x-robots-tag": "all" }).join(), /noindex/);
});

test("admin: the strict page policy must not leak into /admin (it would break the CMS)", () => {
  const leaked = { ...admin(), "content-security-policy": `${admin()["content-security-policy"]}, ${PAGE_CSP}` };
  assert.match(liveHeaderProblems("admin", leaked).join(), /page policy|sha256|wasm-unsafe-eval/);
  const noCms = { ...admin(), "content-security-policy": "frame-ancestors 'none'" };
  assert.match(liveHeaderProblems("admin", noCms).join(), /unpkg/);
});

test("hashed assets are cached for a year, immutable", () => {
  assert.deepEqual(liveHeaderProblems("immutable", { "cache-control": "public, max-age=31536000, immutable" }), []);
  assert.match(liveHeaderProblems("immutable", { "cache-control": "public, max-age=3600" }).join(), /immutable/);
});
