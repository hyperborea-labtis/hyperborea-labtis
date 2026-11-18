// Footnote anchors (Sätteri hast plugin, Astro's Markdown processor).
//
// The old Drupal site wrote every note as `<a id="01">[1]</a> text` and linked to it
// with `<a href="#01">`. The import turned the notes into plain paragraphs
// (`\[1\] text`) and lost the `id`, so every `#01` link pointed at nothing.
//
// This plugin rebuilds the targets at render time, so the Markdown stays as an
// editor would naturally write it (`[1] text`) and no content file has to change:
//   1. find the paragraphs that start with `[label]` (digits or asterisks, with or
//      without a space after the bracket);
//   2. for each in-page link `#x` whose target does not exist, give the note with
//      the same label the id `x`, so old URLs such as `/es/paper/slug#01` keep working;
//   3. give every numbered note still without an id the Drupal-style id `01`, `02`…
//      (see noteAnchor in src/lib/author.ts), so something outside the Markdown, like
//      the author's marker in the paper header, can link to it.
// Links with no matching note are left alone; `npm run verify` (check 6b) lists them.

const NOTE_LABEL = /^\s*\[(\d+|\*+)\]/;

/** @param {string} s */
const canonical = (s) => (/^\d+$/.test(s) ? String(parseInt(s, 10)) : /^\*+$/.test(s) ? s : null);

/** @param {unknown} href */
const fragmentOf = (href) => {
  if (typeof href !== "string" || !href.startsWith("#") || href.length < 2) return null;
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
};

/**
 * @param {any} node
 * @param {(n: any) => void} fn
 */
const walk = (node, fn) => {
  fn(node);
  if (node.children) for (const c of node.children) walk(c, fn);
};

/** @type {import("satteri").HastPluginDefinition} */
export const footnotes = {
  name: "footnotes",
  before(root, ctx) {
    /** @type {Set<string>} */
    const ids = new Set();
    /** @type {Map<string, any>} note label -> paragraph */
    const notes = new Map();
    /** @type {any[]} */
    const links = [];

    walk(root, (n) => {
      if (n.type !== "element") return;
      const id = n.properties?.id;
      if (typeof id === "string") ids.add(id);
      if (n.tagName === "a" && fragmentOf(n.properties?.href) !== null) links.push(n);
      if (n.tagName === "p") {
        const first = n.children?.[0];
        const m = first?.type === "text" ? NOTE_LABEL.exec(first.value) : null;
        const key = m && canonical(m[1]);
        if (key && !notes.has(key)) notes.set(key, n);
      }
    });
    if (!notes.size) return;
    const pad2 = (/** @type {string} */ k) => k.padStart(2, "0");

    /** @type {Map<string, string>} note label -> id given to its paragraph */
    const assigned = new Map();
    for (const a of links) {
      const frag = /** @type {string} */ (fragmentOf(a.properties.href));
      if (ids.has(frag)) continue; // the target exists (a heading, or a note already given this id)
      const key = canonical(frag);
      const note = key && notes.get(key);
      if (!note || note.properties?.id) continue;
      const id = assigned.get(key);
      if (id === undefined) {
        ctx.setProperty(note, "id", frag);
        assigned.set(key, frag);
        ids.add(frag);
      } else {
        ctx.setProperty(a, "href", `#${encodeURIComponent(id)}`); // same note, other spelling (#1 vs #01)
      }
    }

    for (const [key, note] of notes) {
      const id = pad2(key);
      if (!/^\d+$/.test(key) || note.properties?.id || assigned.has(key) || ids.has(id)) continue;
      ctx.setProperty(note, "id", id);
      ids.add(id);
    }
  },
};
