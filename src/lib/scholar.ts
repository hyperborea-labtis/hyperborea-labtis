// Google Scholar (Highwire Press) citation_* tags for a paper, as pure functions covered by
// `npm test`. See https://scholar.google.com/intl/en/scholar/inclusion.html#indexing
import { splitAuthor } from "./author.ts";

/** Authors of a paper from its `author` field: "A y B", "A & B" or "A; B" gives two; the
 * footnote marker ("[1]") and honorifics ("Por el Dr.") are dropped. */
export function parseAuthors(raw: string | undefined): string[] {
  if (!raw) return [];
  const name = splitAuthor(raw).name.replace(/^\s*Por\s+(?:el\s+|la\s+)?(?:Dr|Dra|Prof|Lic|Mg)\.?\s+/i, "").replace(/^\s*Por\s+/i, "");
  return [...new Set(name.split(/\s+(?:y|e|and|&)\s+|\s*;\s*/).map((a) => a.trim()).filter(Boolean))];
}

const two = (n: number) => String(n).padStart(2, "0");

/** `citation_publication_date`: YYYY/MM/DD when the paper has its publication date, else the
 * year of its issue alone: never an invented month or day. */
export function scholarDate(published: Date | undefined, issueYear: number | undefined): string | undefined {
  if (published) return `${published.getUTCFullYear()}/${two(published.getUTCMonth() + 1)}/${two(published.getUTCDate())}`;
  return issueYear ? String(issueYear) : undefined;
}

/** The same date for JSON-LD (ISO 8601: YYYY-MM-DD, or the bare year). */
export function isoDate(published: Date | undefined, issueYear: number | undefined): string | undefined {
  return scholarDate(published, issueYear)?.replaceAll("/", "-");
}

export interface ScholarInput {
  title: string;
  authors: string[];
  /** Affiliation text of the paper; attached only when there is a single author. */
  institution?: string;
  date?: string;
  journal: string;
  issn: string;
  /** The journal numbers its yearly issues ("Hyperborea 4 (2021)"), cited as the volume. */
  volume?: number;
  language: string;
  keywords: string[];
  abstractUrl: string;
  pdfUrl?: string;
  publisher: string;
}

export function scholarTags(i: ScholarInput): { name: string; content: string }[] {
  const tags: { name: string; content: string }[] = [{ name: "citation_title", content: i.title }];
  for (const author of i.authors) tags.push({ name: "citation_author", content: author });
  if (i.authors.length === 1 && i.institution?.trim()) tags.push({ name: "citation_author_institution", content: i.institution.trim() });
  if (i.date) tags.push({ name: "citation_publication_date", content: i.date });
  tags.push({ name: "citation_journal_title", content: i.journal }, { name: "citation_issn", content: i.issn });
  if (i.volume !== undefined) tags.push({ name: "citation_volume", content: String(i.volume) });
  tags.push({ name: "citation_language", content: i.language });
  if (i.keywords.length) tags.push({ name: "citation_keywords", content: i.keywords.join("; ") });
  tags.push({ name: "citation_abstract_html_url", content: i.abstractUrl }, { name: "citation_fulltext_html_url", content: i.abstractUrl });
  if (i.pdfUrl) tags.push({ name: "citation_pdf_url", content: i.pdfUrl });
  tags.push({ name: "citation_publisher", content: i.publisher });
  return tags;
}
