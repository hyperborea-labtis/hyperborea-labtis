import type { Locale } from "../i18n/config";
import { ISSUE_NUMBERS, ISSUE_YEARS } from "./issues";

export type NavLink = { label: string; href: string; external?: boolean };
export type NavItem = NavLink & { children?: NavLink[] };


// Sections are taxonomy terms (field_categoria). Names are proper nouns and
// stay identical across languages. `path` is the URL segment of the term on the
// current Drupal site (/es/Mare_Sugenum…): it must not change, so existing links
// keep working. The `section` value of a paper must equal one `label` below.
export type Section = { label: string; path: string };

// Shown in the main menu and footer.
export const SECTIONS: Section[] = [
  { label: "Mare Sugenum", path: "Mare_Sugenum" },
  { label: "Kino LabTIS", path: "Kino_LabTIS" },
  { label: "Manet et manebit", path: "Manet_et_manebit" },
  { label: "41º 9’ S 71º 8’ W", path: "41-9-S-71-8-W" },
];

// Listed under the "Hyperborea" menu instead of the main bar.
export const AFINIDADES_ELECTIVAS: Section = { label: "Afinidades electivas", path: "Afinidades_electivas" };

/** Every section page the site generates. */
export const ALL_SECTIONS: Section[] = [...SECTIONS, AFINIDADES_ELECTIVAS];

/** Build the primary navigation for a locale (local routes are prefixed). */
export function mainNav(locale: Locale): NavItem[] {
  const L = (p: string) => `/${locale}${p}`;
  return [
    ...SECTIONS.map((s) => ({ label: s.label, href: L(`/${s.path}`) })),
    {
      label: "Hyperborea",
      href: L("/presentacion"),
      // Labels stay in Spanish for en/fr too, as on the current Drupal site.
      children: [
        { label: "Sobre Hyperborea", href: L("/sobre_hyperborea") },
        { label: "Presentación", href: L("/presentacion") },
        ...MENU_ISSUE_ORDER.map((n) => ({
          label: `Número ${n} (${ISSUE_YEARS[n]})`,
          href: L(`/numero-${n}`),
        })),
        { label: AFINIDADES_ELECTIVAS.label, href: L(`/${AFINIDADES_ELECTIVAS.path}`) },
        { label: "Convocatorias", href: L("/convocatorias") },
        {
          label: "Criterios y directrices de publicación",
          href: L("/criterios_y_directrices_publicacion"),
        },
        { label: "Actividades culturales y académicas", href: L("/actividades") },
        { label: "Contacto", href: L("/contact") },
      ],
    },
  ];
}

// Newest issue first (8, 7, … 1); a new issue added to ISSUE_YEARS goes on top.
const MENU_ISSUE_ORDER = [...ISSUE_NUMBERS].sort((a, b) => b - a);

export function subfooterNav(locale: Locale): NavLink[] {
  const L = (p: string) => `/${locale}${p}`;
  return [
    { label: "Contacto", href: L("/contact") },
    { label: "Presentación", href: L("/presentacion") },
    { label: "Sobre Hyperborea", href: L("/sobre_hyperborea") },
  ];
}

export function footerInstitucional(locale: Locale): NavLink[] {
  const L = (p: string) => `/${locale}${p}`;
  return [
    { label: "Sobre Hyperborea", href: L("/sobre_hyperborea") },
    { label: "Presentación", href: L("/presentacion") },
  ];
}

export function footerMenu(locale: Locale): NavLink[] {
  return SECTIONS.map((s) => ({ label: s.label, href: `/${locale}/${s.path}` }));
}

export type Partner = { alt: string; src: string; href: string };
export const PARTNERS: Partner[] = [
  { alt: "Dialnet", src: "/site/partners/dialnet_black.png", href: "https://dialnet.unirioja.es/servlet/revista?codigo=29071" },
  { alt: "Malena", src: "/site/partners/malena_black.png", href: "https://www.caicyt-conicet.gov.ar/malena/items/show/2264" },
  { alt: "Latindex", src: "/site/partners/latindex_black.png", href: "https://www.latindex.org/latindex/ficha/26479" },
  { alt: "ROAD", src: "/site/partners/road_black.png", href: "https://portal.issn.org/resource/ISSN/2618-4397" },
  { alt: "ERIHPLUS", src: "/site/partners/erihplus_black.png", href: "https://kanalregister.hkdir.no/publiseringskanaler/erihplus/periodical/info.action?id=507877" },
];
