// HTML sanitizer for Markdown content (Sätteri hast plugin).
//
// Markdown lets editors write raw HTML, and Sätteri passes it through untouched:
// `<script>`, `onerror=` and `javascript:` links would reach the page. The CMS
// token lives in the browser of every editor on the same origin, so a script that
// slips in through a pull request is a token theft. This plugin keeps only what the
// content really uses (figures, tables, anchors, emphasis…) and drops the rest:
//   - raw HTML is parsed tag by tag against an allow-list of tags and attributes;
//   - script/style/iframe/object/svg… are removed together with their content, even
//     when Sätteri splits them across sibling nodes (`<script>`, text, `</script>`);
//   - `on*` handlers and `style` never survive (the site CSP forbids inline styles);
//   - URLs must be relative, http(s), mailto or tel (data: only for images), after
//     decoding entities and whitespace tricks such as `java&#x09;script:`;
//   - links written in Markdown (`[x](javascript:…)`) are unwrapped.
// `npm test` covers the rules; `npm run verify` re-checks the built HTML.

const DROP_WITH_CONTENT = [
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "noscript", "template", "textarea", "select", "svg", "math", "title", "head",
];
const DROP_RE = DROP_WITH_CONTENT.join("|");

const VOID = new Set(["img", "br", "hr", "col"]);

const GLOBAL_ATTRS = ["id", "class", "lang", "dir", "title", "role"];
/** @type {Record<string, string[]>} */
const ALLOWED = {
  a: ["href", "target", "rel", "hreflang"],
  abbr: [], b: [], blockquote: ["cite"], br: [], caption: [], cite: [], code: [],
  col: ["span"], colgroup: ["span"], dd: [], del: [], div: [], dl: [], dt: [], em: [],
  figcaption: [], figure: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], hr: [],
  i: [], img: ["src", "alt", "width", "height", "loading", "decoding"], ins: [],
  li: ["value"], mark: [], ol: ["start", "type", "reversed"], p: [], pre: [], q: ["cite"],
  s: [], small: [], span: [], strong: [], sub: [], sup: [],
  table: ["align", "border", "cellpadding", "cellspacing", "summary", "width"],
  tbody: [], td: ["colspan", "rowspan", "headers", "align", "valign", "width", "height"],
  tfoot: [], th: ["colspan", "rowspan", "headers", "scope", "align", "valign", "width", "height"],
  thead: [], time: ["datetime"], tr: ["align", "valign"], u: [], ul: [],
};
const URL_ATTRS = new Set(["href", "src", "cite"]);
const NUMERIC_ATTRS = new Set(["width", "height", "colspan", "rowspan", "border", "cellpadding", "cellspacing", "start", "span", "value"]);
const ALIGN_RE = /^(left|right|center|top|middle|bottom|justify|baseline)$/i;

// Whitespace, control and invisible characters (incl. U+2028/2029 and the BOM).
const STRIP_RE = new RegExp(
  String.raw`[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u180e\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]`,
  "g",
);

const NAMED_ENTITIES = { colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" };

/** @param {string} s */
function decodeEntities(s) {
  const cp = (/** @type {number} */ n) => {
    try {
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    } catch {
      return "";
    }
  };
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => cp(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[/** @type {keyof typeof NAMED_ENTITIES} */ (n.toLowerCase())] ?? m);
}

/**
 * Is this URL safe to put in href/src? Relative URLs, http(s), mailto and tel pass;
 * `data:` passes only for raster images (`image: true`).
 * @param {unknown} value
 * @param {{ image?: boolean }} [opts]
 */
export function isSafeUrl(value, { image = false } = {}) {
  // Browsers drop tabs, newlines and control characters inside a scheme, and
  // decode entities in attribute values before parsing the URL.
  const decoded = decodeEntities(String(value ?? "")).replace(STRIP_RE, "");
  const prefix = decoded.split(/[/?#]/, 1)[0];
  if (prefix.includes("&")) return false; // an entity we could not resolve may hide a scheme
  if (!prefix.includes(":")) return true; // relative
  const scheme = prefix.slice(0, prefix.indexOf(":")).toLowerCase();
  if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") return true;
  if (scheme === "data") return image && /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]*$/i.test(decoded);
  return false;
}

/** @param {string} v */
const escAttr = (v) => v.replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * @param {string} tag
 * @param {string} name
 * @param {string} value
 * @returns {boolean}
 */
function attrAllowed(tag, name, value) {
  if (name.startsWith("on") || name === "style") return false;
  const allowed = GLOBAL_ATTRS.includes(name) || name.startsWith("data-") || (ALLOWED[tag] ?? []).includes(name);
  if (!allowed) return false;
  if (name.startsWith("data-")) return /^data-[a-z0-9_.-]+$/.test(name);
  if (URL_ATTRS.has(name)) return isSafeUrl(value, { image: tag === "img" && name === "src" });
  if (name === "id") return /^[\w:.-]{1,64}$/.test(value);
  if (name === "class") return /^[\w\s:-]{0,200}$/.test(value);
  if (name === "role") return /^[a-z-]{1,30}$/i.test(value);
  if (name === "target") return value === "_blank" || value === "_self";
  if (name === "loading") return value === "lazy" || value === "eager";
  if (name === "align" || name === "valign") return ALIGN_RE.test(value);
  if (NUMERIC_ATTRS.has(name)) return /^\d{1,5}%?$/.test(value);
  return value.length <= 2000;
}

const TAG_RE = /<!--[\s\S]*?-->|<![^>]*>|<\?[^>]*>|<\/?[a-zA-Z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>/g;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const BLOCK_RE = new RegExp(`<(${DROP_RE})\\b(?:"[^"]*"|'[^']*'|[^'">])*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");

/** @param {string} text */
const escText = (text) => text.replace(/</g, "&lt;");

/**
 * Sanitize a fragment of raw HTML: only allow-listed tags and attributes survive,
 * everything else is dropped; stray `<` is escaped.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeHtml(input) {
  let html = String(input);
  for (let i = 0; i < 5; i++) {
    const next = html.replace(BLOCK_RE, "");
    if (next === html) break;
    html = next;
  }
  let out = "";
  let last = 0;
  for (const m of html.matchAll(TAG_RE)) {
    out += escText(html.slice(last, m.index));
    last = m.index + m[0].length;
    const raw = m[0];
    if (raw.startsWith("<!") || raw.startsWith("<?")) continue;
    const closing = raw.startsWith("</");
    const nameMatch = /^<\/?([a-zA-Z][^\s/>]*)/.exec(raw);
    const tag = (nameMatch?.[1] ?? "").toLowerCase();
    if (!(tag in ALLOWED)) continue;
    if (closing) {
      if (!VOID.has(tag)) out += `</${tag}>`;
      continue;
    }
    /** @type {[string, string | null][]} */
    const attrs = [];
    const seen = new Set();
    const attrSrc = raw.slice(nameMatch[0].length).replace(/\/?>$/, "");
    for (const a of attrSrc.matchAll(ATTR_RE)) {
      const name = a[1].toLowerCase();
      if (seen.has(name)) continue;
      seen.add(name);
      const value = a[2] ?? a[3] ?? a[4] ?? null;
      if (value === null) {
        if (name === "reversed" && tag === "ol") attrs.push([name, null]);
        continue;
      }
      if (attrAllowed(tag, name, value)) attrs.push([name, value]);
    }
    if (tag === "a" && attrs.some(([n, v]) => n === "target" && v === "_blank")) {
      const i = attrs.findIndex(([n]) => n === "rel");
      if (i >= 0) attrs.splice(i, 1);
      attrs.push(["rel", "noopener noreferrer"]);
    }
    out += `<${tag}${attrs.map(([n, v]) => (v === null ? ` ${n}` : ` ${n}="${escAttr(v)}"`)).join("")}>`;
  }
  return out + escText(html.slice(last));
}

/**
 * @param {any} node
 * @param {(n: any) => void} fn
 */
const walk = (node, fn) => {
  fn(node);
  if (node.children) for (const c of node.children) walk(c, fn);
};

const OPEN_DROP_RE = new RegExp(`^<(${DROP_RE})\\b(?:"[^"]*"|'[^']*'|[^'">])*>$`, "i");

/** @type {import("satteri").HastPluginDefinition} */
export const sanitize = {
  name: "sanitize",
  before(root, ctx) {
    walk(root, (parent) => {
      const kids = parent.children;
      if (!kids) return;
      /** @type {string | null} */
      let skipUntil = null; // tag whose content is being dropped across sibling nodes
      for (const n of kids) {
        if (skipUntil) {
          const closes = n.type === "raw" && new RegExp(`^\\s*</${skipUntil}\\s*>`, "i").test(n.value);
          ctx.removeNode(n);
          if (closes) skipUntil = null;
          continue;
        }
        if (n.type === "raw") {
          const open = OPEN_DROP_RE.exec(n.value.trim());
          if (open && !n.value.trim().endsWith("/>")) {
            skipUntil = open[1].toLowerCase();
            ctx.removeNode(n);
            continue;
          }
          const clean = sanitizeHtml(n.value);
          if (clean === "") ctx.removeNode(n);
          else if (clean !== n.value) ctx.replaceNode(n, { type: "raw", value: clean });
        } else if (n.type === "element") {
          const props = n.properties ?? {};
          if (n.tagName === "a" && typeof props.href === "string" && !isSafeUrl(props.href)) {
            ctx.replaceNode(n, n.children);
          } else if (n.tagName === "img" && typeof props.src === "string" && !isSafeUrl(props.src, { image: true })) {
            ctx.removeNode(n);
          }
        }
      }
    });
  },
};
