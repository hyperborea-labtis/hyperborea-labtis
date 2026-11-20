// Central i18n configuration for the three-language site (ES default, EN, FR).

export const locales = ["es", "en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export const localeNames: Record<Locale, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * UI chrome strings per locale. Nav/section names are proper nouns and stay the
 * same across languages; verify the EN/FR wording against the source if needed.
 */
export const ui = {
  es: {
    "nav.search": "Buscar...",
    "home.latest": "Últimas publicaciones",
    "home.more": "Ver más",
    "pager.label": "Paginación",
    "pager.prev": "Anterior",
    "pager.next": "Siguiente",
    "footer.institucional": "Institucional",
    "footer.menu": "Menú al pie",
    "footer.contacto": "Contacto",
    "footer.presentacion": "Presentación",
    "footer.sobre": "Sobre Hyperborea",
    "paper.abstract": "Resumen",
    "paper.keywords": "Palabras clave",
    "paper.category": "Categoría",
    "paper.abstractEditorial": "Resumen elaborado por la redacción",
    "paper.related": "Artículos relacionados",
    "paper.received": "Fecha de recepción",
    "paper.evaluated": "Fecha de evaluación",
    "paper.published": "Fecha de publicación",
    "paper.issue": "Publicación Hyperborea",
    "paper.file": "Archivo original",
    "paper.issueNumber": "Número",
    "license.text": "Esta obra está bajo una",
    "license.name": "Licencia Creative Commons Atribución-NoComercial-SinDerivadas 3.0 Unported",
    "license.alt": "Licencia Creative Commons",
    "paper.pdf": "Descargar PDF",
    "lang.label": "Idioma",
    "skip": "Pasar al contenido principal",
    "issue.published": "Publicación Hyperborea",
    "issue.number": "Número",
    "search.title": "Buscar",
    "search.label": "Buscar en el sitio",
    "search.submit": "Buscar",
    "search.results": "resultados",
    "search.none": "No se encontraron resultados para",
    "search.more": "Mostrar más",
    "search.unavailable": "El índice de búsqueda no está disponible. Ejecutá «npm run build» (y reiniciá «npm run dev» o usá «npm run preview»).",
    "search.hint": "Escribí al menos 2 letras para buscar en artículos, actividades y páginas.",
    "search.filter.type": "Tipo",
    "search.filter.section": "Sección",
    "search.filter.issue": "Número",
    "search.filter.all": "Todos",
    "search.type.paper": "Paper",
    "search.type.activity": "Actividad",
    "search.type.page": "Página",
  },
  en: {
    "nav.search": "Search...",
    "home.latest": "Latest publications",
    "home.more": "See more",
    "pager.label": "Pagination",
    "pager.prev": "Previous",
    "pager.next": "Next",
    "footer.institucional": "About",
    "footer.menu": "Footer menu",
    "footer.contacto": "Contact",
    "footer.presentacion": "Presentation",
    "footer.sobre": "About Hyperborea",
    "paper.abstract": "Abstract",
    "paper.keywords": "Keywords",
    "paper.category": "Category",
    "paper.abstractEditorial": "Abstract prepared by the editorial team",
    "paper.related": "Related articles",
    "paper.received": "Date received",
    "paper.evaluated": "Date reviewed",
    "paper.published": "Date published",
    "paper.issue": "Hyperborea issue",
    "paper.file": "Original file",
    "paper.issueNumber": "Issue",
    "license.text": "This work is licensed under a",
    "license.name": "Creative Commons Attribution-NonCommercial-NoDerivs 3.0 Unported License",
    "license.alt": "Creative Commons license",
    "paper.pdf": "Download PDF",
    "lang.label": "Language",
    "skip": "Skip to main content",
    "issue.published": "Hyperborea publication",
    "issue.number": "Issue",
    "search.title": "Search",
    "search.label": "Search the site",
    "search.submit": "Search",
    "search.results": "results",
    "search.none": "No results found for",
    "search.more": "Show more",
    "search.unavailable": "The search index is not available. Run “npm run build” (then restart “npm run dev” or use “npm run preview”).",
    "search.hint": "Type at least 2 letters to search articles, activities and pages.",
    "search.filter.type": "Type",
    "search.filter.section": "Section",
    "search.filter.issue": "Issue",
    "search.filter.all": "All",
    "search.type.paper": "Paper",
    "search.type.activity": "Activity",
    "search.type.page": "Page",
  },
  fr: {
    "nav.search": "Rechercher...",
    "home.latest": "Dernières publications",
    "home.more": "Voir plus",
    "pager.label": "Pagination",
    "pager.prev": "Précédent",
    "pager.next": "Suivant",
    "footer.institucional": "Institutionnel",
    "footer.menu": "Menu de pied de page",
    "footer.contacto": "Contact",
    "footer.presentacion": "Présentation",
    "footer.sobre": "À propos d’Hyperborea",
    "paper.abstract": "Résumé",
    "paper.keywords": "Mots-clés",
    "paper.category": "Catégorie",
    "paper.abstractEditorial": "Résumé rédigé par la rédaction",
    "paper.related": "Articles liés",
    "paper.received": "Date de réception",
    "paper.evaluated": "Date d’évaluation",
    "paper.published": "Date de publication",
    "paper.issue": "Publication Hyperborea",
    "paper.file": "Fichier original",
    "paper.issueNumber": "Numéro",
    "license.text": "Cette œuvre est mise à disposition selon les termes de la",
    "license.name": "Licence Creative Commons Attribution - Pas d’Utilisation Commerciale - Pas de Modification 3.0 non transposé",
    "license.alt": "Licence Creative Commons",
    "paper.pdf": "Télécharger le PDF",
    "lang.label": "Langue",
    "skip": "Aller au contenu principal",
    "issue.published": "Publication Hyperborea",
    "issue.number": "Numéro",
    "search.title": "Rechercher",
    "search.label": "Rechercher sur le site",
    "search.submit": "Rechercher",
    "search.results": "résultats",
    "search.none": "Aucun résultat pour",
    "search.more": "Afficher plus",
    "search.unavailable": "L’index de recherche n’est pas disponible. Lancez « npm run build » (puis relancez « npm run dev » ou utilisez « npm run preview »).",
    "search.hint": "Saisissez au moins 2 lettres pour chercher dans les articles, activités et pages.",
    "search.filter.type": "Type",
    "search.filter.section": "Rubrique",
    "search.filter.issue": "Numéro",
    "search.filter.all": "Tous",
    "search.type.paper": "Article",
    "search.type.activity": "Activité",
    "search.type.page": "Page",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UIKey = keyof (typeof ui)["es"];

export function useTranslations(locale: Locale) {
  return function t(key: UIKey): string {
    return ui[locale][key] ?? ui[defaultLocale][key];
  };
}

/** Prefix a locale-relative path (e.g. "/paper/x") with its locale segment. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean === "/" ? "" : clean}`;
}
