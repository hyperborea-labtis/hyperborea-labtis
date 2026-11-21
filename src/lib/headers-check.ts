// What the HTTP response headers of the live (or locally served) site must look like.
// scripts/check-headers.mjs fetches a few key URLs and feeds the headers here; the tests pin the rules.
// Header names are lower case. When Cloudflare merges several rules that set the same header it joins the
// values with ", ", so a response can carry two Content-Security-Policy values (both are enforced).

import { cspProblems } from "./csp.ts";

export type HeaderKind = "page" | "admin" | "immutable";
type Headers = Record<string, string | undefined>;

// A CSP has no commas inside, so the joined value splits cleanly.
const policies = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const restricts = (policy: string) => /\b(script-src|default-src)\b/.test(policy);

export function liveHeaderProblems(kind: HeaderKind, h: Headers): string[] {
  const p: string[] = [];
  const need = (name: string) => {
    if (!h[name]) p.push(`${name} is missing`);
    return h[name] ?? "";
  };

  if (kind === "immutable") {
    const cc = need("cache-control");
    const age = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0);
    if (!/\bimmutable\b/.test(cc) || age < 31536000) p.push(`cache-control must be a year and immutable for hashed files (got "${cc}")`);
    return p;
  }

  const csp = need("content-security-policy");
  const list = policies(csp);

  if (kind === "admin") {
    if (!/\bno-store\b/.test(need("cache-control"))) p.push("cache-control must be no-store on /admin");
    if (!/\bnoindex\b/i.test(need("x-robots-tag"))) p.push("x-robots-tag must say noindex on /admin");
    if (!/unpkg\.com/.test(csp)) p.push("the CMS policy must allow its script from unpkg.com");
    if (/'wasm-unsafe-eval'|'sha(256|384|512)-/.test(csp)) p.push("the page policy (hashes, wasm-unsafe-eval) leaked into /admin: it is meant for /es /en /fr only");
    for (const policy of list.filter(restricts)) for (const m of cspProblems(policy, { allowInlineStyle: true })) p.push(`/admin policy: ${m}`);
    return p;
  }

  // page
  const ancestors = list.some((x) => /(^|;\s*)frame-ancestors 'none'/.test(x));
  if (!ancestors) p.push("content-security-policy must carry frame-ancestors 'none'");
  const main = list.find(restricts);
  if (!main) p.push("content-security-policy has no script-src/default-src (only frame-ancestors?)");
  else for (const m of cspProblems(main)) p.push(`content-security-policy: ${m}`);

  const hsts = need("strict-transport-security");
  if (hsts) {
    if (Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0) < 31536000) p.push("strict-transport-security: max-age must be at least a year (31536000)");
    if (!/includeSubDomains/i.test(hsts)) p.push("strict-transport-security: includeSubDomains is missing");
    if (/preload/i.test(hsts)) p.push("strict-transport-security: preload is not wanted yet (hard to undo)");
  }
  if (need("x-content-type-options").toLowerCase() !== "nosniff") p.push("x-content-type-options must be nosniff");
  if (need("x-frame-options").toUpperCase() !== "DENY") p.push("x-frame-options must be DENY");
  need("referrer-policy");
  need("cross-origin-opener-policy");
  const pp = need("permissions-policy");
  if (pp) for (const f of ["camera=()", "microphone=()", "browsing-topics=()"]) if (!pp.includes(f)) p.push(`permissions-policy must contain ${f}`);
  return p;
}
