import { defineCollection } from "astro:content";
import { z } from "astro:schema";
import { glob } from "astro/loaders";

const localeEnum = z.enum(["es", "en", "fr"]);

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
    aliases,
    slug: z.string(),
    title: z.string(),
    section: z.string().optional(),
    issue: z.number().int().positive().optional(),
    issueOrder: z.number().int().positive().optional(),
    // Position on the home page (1 = first). Papers without it are not featured.
    featured: z.number().int().positive().optional(),
    author: z.string().optional(),
    email: z.string().optional(),
    affiliation: z.string().optional(),
    abstract: z.string().optional(),
    keywords: z.array(z.string()).default([]),
    publishedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    pdf: z.string().optional(),
    draft: z.boolean().default(false),
    sourceUrl: z.string().url().optional(),
  }),
});

// Activities / news (node--article, path /actividad/...): simpler than papers.
const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles", generateId: keepPathId }),
  schema: z.object({
    lang: localeEnum.optional(),
    translationKey: z.string().optional(),
    aliases,
    slug: z.string(),
    title: z.string(),
    publishedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    pdf: z.string().optional(),
    draft: z.boolean().default(false),
    sourceUrl: z.string().url().optional(),
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
    sourceUrl: z.string().url().optional(),
  }),
});

export const collections = { papers, articles, pages };
