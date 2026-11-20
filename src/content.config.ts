import { defineCollection } from "astro:content";
import { z } from "astro:schema";
import { glob } from "astro/loaders";

const localeEnum = z.enum(["es", "en", "fr"]);

// Optional date. The CMS saves an empty date widget as `''` (or null), which
// must mean "no date" instead of failing the build with an invalid date.
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
// Same for other optional non-text fields an editor may clear in the CMS.
const optionalPositiveInt = z.preprocess(blankToUndefined, z.number().int().positive().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());

// Extra URLs of the old site that must keep working, one path per line, each
// starting with "/". They become redirects to this entry at build time
// (scripts/build-redirects.mjs). Not needed for the canonical URL or for
// /{lang}/node/{translationKey}, which are generated automatically.
const aliases = z.array(z.string().startsWith("/")).default([]);

// Keep the language directory in the entry id; otherwise es/en/fr files that
// share a basename (e.g. presentacion.md) collide and only one survives.
const keepPathId = ({ entry }: { entry: string }) => entry.replace(/\.md$/, "");

// Academic papers. Structured metadata lives in frontmatter; only the article
// prose lives in the Markdown body. One file per language; `translationKey`
// (the Drupal node UUID) links the translations of the same paper.
const papers = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/papers", generateId: keepPathId }),
  schema: z.object({
    lang: localeEnum.optional(),
    translationKey: z.string().optional(),
    // Creation timestamp (from Drupal). Listings sort newest-first by it, so the
    // order matches the old site down to the minute; without it `publishedDate` is used.
    created: optionalDate,
    aliases,
    slug: z.string(),
    title: z.string(),
    section: z.string().optional(),
    issue: optionalPositiveInt,
    issueOrder: optionalPositiveInt,
    author: z.string().optional(),
    email: z.string().optional(),
    affiliation: z.string().optional(),
    abstract: z.string().optional(),
    // Who wrote the abstract: the author (default) or the editorial team, which the paper page says.
    abstractSource: z.enum(["author", "editorial"]).optional(),
    keywords: z.array(z.string()).default([]),
    // Shown under the paper: reception, evaluation and publication dates.
    receivedDate: optionalDate,
    evaluatedDate: optionalDate,
    publishedDate: optionalDate,
    heroImage: z.string().optional(),
    /** Text alternative of the hero image. Empty = decorative (the title sits next to it). */
    heroAlt: z.string().optional(),
    pdf: z.string().optional(),
    draft: z.boolean().default(false),
    sourceUrl: optionalUrl,
  }),
});

// Activities / news (node--article, path /actividad/...): simpler than papers.
const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles", generateId: keepPathId }),
  schema: z.object({
    lang: localeEnum.optional(),
    translationKey: z.string().optional(),
    created: optionalDate,
    aliases,
    slug: z.string(),
    title: z.string(),
    publishedDate: optionalDate,
    heroImage: z.string().optional(),
    /** Text alternative of the hero image. Empty = decorative (the title sits next to it). */
    heroAlt: z.string().optional(),
    pdf: z.string().optional(),
    draft: z.boolean().default(false),
    sourceUrl: optionalUrl,
  }),
});

// Static institutional pages (Presentación, Sobre Hyperborea, Convocatorias…).
const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages", generateId: keepPathId }),
  schema: z.object({
    lang: localeEnum.optional(),
    translationKey: z.string().optional(),
    aliases,
    slug: z.string(),
    title: z.string(),
    draft: z.boolean().default(false),
    sourceUrl: optionalUrl,
  }),
});

export const collections = { papers, articles, pages };
