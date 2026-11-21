// What an edit to a content file may not do. The editorial workflow opens a pull request for every save in
// Sveltia CMS, which rewrites the WHOLE file from its form: a field the form does not know is dropped, and
// the Markdown editor can write things the site cannot use. scripts/check-content-diff.mjs compares each
// changed src/content/**/*.md with its version on the base branch and fails the pull request on:
//   - losing slug, translationKey, created or a non-empty aliases (they keep URLs, order and redirects alive)
//   - changing the slug without keeping the old address in `aliases` (the old URL would answer 404)
//   - a pasted image (`data:` URL) in the text, or a link written as ](< url)
//   - more escaped emphasis marks (\_ or \*) than before: the Markdown editor does this to italics that sit
//     next to a URL with underscores, and the italics then show as literal symbols
// and only warns about other fields that disappear or empty fields that appear.

import YAML from "yaml";

export interface Changes {
  errors: string[];
  warnings: string[];
}

const PROTECTED = ["slug", "translationKey", "created", "aliases"];

interface Parsed {
  data: Record<string, unknown>;
  body: string;
}

function parse(text: string): Parsed | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  try {
    const data = YAML.parse(m[1]);
    return data && typeof data === "object" && !Array.isArray(data) ? { data: data as Record<string, unknown>, body: m[2] } : null;
  } catch {
    return null;
  }
}

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const DATA_IMAGE = /data:image\/[a-z+.-]+;base64,/gi;
const ANGLE_LINK = /\]\(<\s/g;
const ESCAPED_EMPHASIS = /\\[_*]/g;

export function contentChanges(before: string | null, after: string): Changes {
  const errors: string[] = [];
  const warnings: string[] = [];
  const next = parse(after);
  if (!next) return { errors: ["the front matter does not parse (--- … --- with valid YAML at the top)"], warnings };
  const prev = before === null ? null : parse(before);

  if (prev) {
    for (const key of Object.keys(prev.data)) {
      if (!(key in next.data) && !empty(prev.data[key])) {
        (PROTECTED.includes(key) ? errors : warnings).push(`field "${key}" was removed`);
      } else if (PROTECTED.includes(key) && key in next.data && empty(next.data[key]) && !empty(prev.data[key])) {
        errors.push(`field "${key}" was emptied`);
      }
    }
    for (const key of Object.keys(next.data)) {
      if (!(key in prev.data) && empty(next.data[key])) warnings.push(`empty field "${key}" was added`);
    }
    const oldSlug = prev.data.slug;
    const newSlug = next.data.slug;
    if (typeof oldSlug === "string" && typeof newSlug === "string" && oldSlug !== newSlug) {
      const aliases = Array.isArray(next.data.aliases) ? next.data.aliases.map(String) : [];
      if (!aliases.some((a) => a.endsWith(`/${oldSlug}`))) errors.push(`the slug changed from "${oldSlug}" to "${newSlug}" but the old address is not in aliases: it would answer 404`);
    }
  }

  const hadImages = prev ? count(prev.body, DATA_IMAGE) : 0;
  if (count(next.body, DATA_IMAGE) > hadImages) errors.push("a pasted image (data: URL) was added to the text: upload the file instead");
  const hadLinks = prev ? count(prev.body, ANGLE_LINK) : 0;
  if (count(next.body, ANGLE_LINK) > hadLinks) errors.push("a link is written as ](< url): the space makes it a broken %20 URL");
  const hadEscapes = prev ? count(prev.body, ESCAPED_EMPHASIS) : 0;
  const nowEscapes = count(next.body, ESCAPED_EMPHASIS);
  if (nowEscapes > hadEscapes) errors.push(`${nowEscapes - hadEscapes} escaped emphasis mark(s) (\\_ or \\*) were added to the text: the italics would show as literal symbols`);
  return { errors, warnings };
}
