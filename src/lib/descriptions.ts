// Localized titles and meta descriptions per kind of page (pure, covered by `npm test`).
// en/fr are translations of the journal's own texts: review them with the client.
import type { Locale } from "../i18n/config";
import { firstParagraph, plainText, truncateAtSentence } from "./meta-text.ts";

const L = <T>(es: T, en: T, fr: T): Record<Locale, T> => ({ es, en, fr });

const SITE_TITLE = L("Hyperborea. Revista de Ensayo y Creación", "Hyperborea. Journal of Essay and Creation", "Hyperborea. Revue d’essai et de création");
const SITE_DESCRIPTION = L(
  "Revista digital anual de ensayo y creación sobre literatura, arte y cine del Laboratorio Texto, imagen y sociedad (LabTIS), UNRN.",
  "Annual digital journal of essays and creative work on literature, art and film by the Text, Image and Society Laboratory (LabTIS), UNRN.",
  "Revue numérique annuelle d’essais et de création sur la littérature, l’art et le cinéma du Laboratoire Texte, image et société (LabTIS), UNRN.",
);

export const siteTitle = (lang: Locale): string => SITE_TITLE[lang];
export const siteDescription = (lang: Locale): string => SITE_DESCRIPTION[lang];

const PAGE_WORD = L("Página", "Page", "Page");
/** Suffix that keeps paginated titles unique ("Actividades | Hyperborea" → "… — Página 2"). */
export const pageSuffix = (lang: Locale, n: number): string => `${PAGE_WORD[lang]} ${n}`;

const KEYWORD_WORD = L("Palabra clave", "Keyword", "Mot-clé");
/** Title of a keyword page ("Palabra clave: X"): a keyword and a paper can share a name. */
export const keywordTitle = (lang: Locale, name: string): string => `${KEYWORD_WORD[lang]}${lang === "fr" ? " " : ""}: ${name}`;

/** A description with its page number, so paginated pages do not repeat the first page's text. */
export const withPage = (description: string, lang: Locale, page: number): string =>
  page === 1 ? description : `${description} (${pageSuffix(lang, page)})`;

export function issueDescription(lang: Locale, { n, year, count }: { n: number; year: number; count: number }): string {
  return L(
    `Índice del número ${n} (${year}) de Hyperborea: ${count} ${count === 1 ? "artículo" : "artículos"} de ensayo y creación sobre literatura, arte y cine.`,
    `Contents of Hyperborea Issue ${n} (${year}): ${count} ${count === 1 ? "article" : "articles"}, essays and creative work on literature, art and film.`,
    `Sommaire du numéro ${n} (${year}) d’Hyperborea : ${count} ${count === 1 ? "article" : "articles"} d’essai et de création sur la littérature, l’art et le cinéma.`,
  )[lang];
}

export function sectionDescription(lang: Locale, { label, count }: { label: string; count: number }): string {
  return L(
    `Sección «${label}» de Hyperborea, revista de ensayo y creación: ${count} ${count === 1 ? "artículo" : "artículos"}.`,
    `“${label}” section of Hyperborea, journal of essay and creation: ${count} ${count === 1 ? "article" : "articles"}.`,
    `Rubrique « ${label} » d’Hyperborea, revue d’essai et de création : ${count} ${count === 1 ? "article" : "articles"}.`,
  )[lang];
}

export function keywordDescription(lang: Locale, { name, count }: { name: string; count: number }): string {
  const one = count === 1;
  return L(
    `${count} ${one ? "artículo" : "artículos"} de Hyperborea, revista de ensayo y creación, con la palabra clave «${name}».`,
    `${count} ${one ? "article" : "articles"} in Hyperborea, journal of essay and creation, tagged “${name}”.`,
    `${count} ${one ? "article" : "articles"} d’Hyperborea, revue d’essai et de création, avec le mot-clé « ${name} ».`,
  )[lang];
}

export type ListingKind = "activities" | "latest" | "search" | "contact";
const LISTING: Record<ListingKind, Record<Locale, string>> = {
  activities: L(
    "Actividades culturales y académicas del Laboratorio Texto, imagen y sociedad (LabTIS): simposios, seminarios, presentaciones y coloquios.",
    "Cultural and academic activities of the Text, Image and Society Laboratory (LabTIS): symposia, seminars, book launches and colloquia.",
    "Activités culturelles et académiques du Laboratoire Texte, image et société (LabTIS) : colloques, séminaires et présentations.",
  ),
  latest: L(
    "Últimas publicaciones de Hyperborea: los artículos y actividades más recientes de la revista de ensayo y creación.",
    "Latest publications in Hyperborea: the most recent articles and activities of the journal of essay and creation.",
    "Dernières publications d’Hyperborea : les articles et activités les plus récents de la revue d’essai et de création.",
  ),
  search: L(
    "Buscar en los artículos, actividades y páginas de Hyperborea, revista de ensayo y creación.",
    "Search the articles, activities and pages of Hyperborea, journal of essay and creation.",
    "Rechercher dans les articles, activités et pages d’Hyperborea, revue d’essai et de création.",
  ),
  contact: L(
    "Contacto con Hyperborea, revista de ensayo y creación del Laboratorio Texto, imagen y sociedad (LabTIS).",
    "Contact Hyperborea, the journal of essay and creation of the Text, Image and Society Laboratory (LabTIS).",
    "Contacter Hyperborea, revue d’essai et de création du Laboratoire Texte, image et société (LabTIS).",
  ),
};
export const listingDescription = (lang: Locale, kind: ListingKind): string => LISTING[kind][lang];

const MAX = 160;

/** Description of a paper: its abstract; else the first paragraph of the text; else author and issue. */
export function paperDescription(
  lang: Locale,
  { abstract, body, author, issue }: { abstract?: string; body: string; author?: string; issue?: number },
): string {
  const fromAbstract = abstract ? plainText(abstract) : "";
  if (fromAbstract) return truncateAtSentence(fromAbstract, MAX);
  const fromBody = firstParagraph(body);
  if (fromBody) return truncateAtSentence(fromBody, MAX);
  const issuePart = issue !== undefined ? `Hyperborea ${issue}` : "Hyperborea";
  const by = L("de", "by", "de")[lang];
  return author ? `${issuePart}, ${by} ${author}.` : `${issuePart}.`;
}

/** Description of an activity or institutional page: its title followed by the first paragraph
 * (the title keeps editions that share an opening sentence apart); the title and the site
 * description when there is no prose. */
export function textDescription(lang: Locale, { body, title }: { body: string; title: string }): string {
  const lead = firstParagraph(body, 60);
  if (!lead) return `${title}. ${SITE_DESCRIPTION[lang]}`.slice(0, MAX);
  const repeatsTitle = lead.toLowerCase().startsWith(title.toLowerCase().slice(0, 30));
  const withTitle = repeatsTitle || title.length > 90 ? lead : `${title.replace(/[.\s]+$/, "")}. ${lead}`;
  return truncateAtSentence(withTitle, MAX);
}
