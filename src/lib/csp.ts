// Content-Security-Policy helpers for the build.
//
// Astro emits the page policy as a <meta> tag (script hashes included). The public validators
// (securityheaders.com, MDN Observatory) read the HTTP header, so scripts/build-headers.mjs copies the
// policy into dist/_headers. Every page of the site carries the same policy, so one header serves all of
// them; these functions merge and check what the pages say, and write the rules.
//
//  - mergeCsps: pages may differ only in their script hashes; anything else is reported
//  - cspProblems: what a sound policy must and must not contain
//  - parseHeadersFile / languageRules: the Cloudflare `_headers` format
//
// The rules are written for /es, /en, /fr and what is under them, NEVER for /*: Cloudflare merges every
// matching rule, and the strict page policy would break /admin (the CMS has its own policy).

export type Csp = Map<string, string[]>;

export const LANGUAGE_PATHS = ["/es", "/es/*", "/en", "/en/*", "/fr", "/fr/*"];
/** Cloudflare rejects a `_headers` line longer than this. */
const MAX_LINE = 2000;

const isHash = (s: string) => /^'sha(256|384|512)-/.test(s);

export function parseCsp(text: string): Csp {
  const csp: Csp = new Map();
  for (const part of text.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) csp.set(name.toLowerCase(), sources);
  }
  return csp;
}

export function serializeCsp(csp: Csp): string {
  return [...csp].map(([name, sources]) => [name, ...sources].join(" ")).join("; ");
}

/** One policy out of many pages. Pages may differ in script hashes only; any other difference is a problem. */
export function mergeCsps(policies: string[]): { csp: string; problems: string[] } {
  const problems: string[] = [];
  const parsed = policies.map(parseCsp);
  const merged: Csp = new Map();
  // The reference for "non-hash sources" is the first policy; every other must agree.
  const base = parsed[0] ?? new Map();
  for (const csp of parsed) {
    for (const [name, sources] of csp) {
      const seen = merged.get(name) ?? [];
      for (const s of sources) if (!seen.includes(s)) seen.push(s);
      merged.set(name, seen);
    }
  }
  const nonHash = (sources: string[] | undefined) => (sources ?? []).filter((s) => !isHash(s));
  for (const [name] of merged) {
    const reference = new Set(nonHash(base.get(name)));
    const extra = new Set<string>();
    for (const csp of parsed) {
      const present = csp.has(name);
      if (!present && base.has(name)) extra.add("(directive missing on some pages)");
      for (const s of nonHash(csp.get(name))) if (!reference.has(s)) extra.add(s);
      for (const s of reference) if (present && !nonHash(csp.get(name)).includes(s)) extra.add(`(without ${s})`);
    }
    if (extra.size) problems.push(`${name} differs between pages beyond script hashes: ${[...extra].join(", ")}`);
  }
  return { csp: serializeCsp(merged), problems };
}

export interface CspOptions {
  /** The CMS needs inline styles; the public pages do not. */
  allowInlineStyle?: boolean;
}

export function cspProblems(text: string, { allowInlineStyle = false }: CspOptions = {}): string[] {
  const csp = parseCsp(text);
  const problems: string[] = [];
  if (!csp.has("default-src")) problems.push("no default-src");
  if (!csp.has("object-src")) problems.push("no object-src (expected 'none')");
  else if (!csp.get("object-src")!.includes("'none'")) problems.push("object-src is not 'none'");
  if (!csp.has("base-uri")) problems.push("no base-uri");
  const scripty = ["script-src", "default-src"];
  for (const name of scripty) {
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'"]) {
      // 'unsafe-inline' next to a hash or nonce is ignored by browsers, but it still says the wrong thing.
      if (csp.get(name)?.includes(bad)) problems.push(`${name} allows ${bad}`);
    }
  }
  if (!allowInlineStyle && csp.get("style-src")?.includes("'unsafe-inline'")) problems.push("style-src allows 'unsafe-inline'");
  for (const [name, sources] of csp) {
    if (sources.includes("*")) problems.push(`${name} has a wildcard (*)`);
    if (scripty.includes(name) || name === "style-src") {
      for (const scheme of ["http:", "https:"]) if (sources.includes(scheme)) problems.push(`${name} allows every ${scheme} source`);
    }
  }
  return problems;
}

export interface HeaderRule {
  path: string;
  headers: [string, string][];
}

/** Cloudflare `_headers`: a path line, then indented `Name: value` lines. */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (/^\s/.test(raw)) {
      const i = raw.indexOf(":");
      if (i > 0 && rules.length) rules[rules.length - 1].headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    } else {
      rules.push({ path: raw.trim(), headers: [] });
    }
  }
  return rules;
}

/** The `_headers` rules that attach the page policy to every language path (and never to /*). */
export function languageRules(csp: string): string {
  const line = `  Content-Security-Policy: ${csp}`;
  if (line.length > MAX_LINE) throw new Error(`the CSP line is ${line.length} characters; Cloudflare accepts at most ${MAX_LINE}`);
  return LANGUAGE_PATHS.map((p) => `${p}\n${line}\n`).join("");
}
