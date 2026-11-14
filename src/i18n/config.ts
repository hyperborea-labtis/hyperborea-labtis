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
    "footer.institucional": "Institucional",
    "footer.menu": "Menú al pie",
    "footer.contacto": "Contacto",
    "footer.presentacion": "Presentación",
    "footer.sobre": "Sobre Hyperborea",
    "paper.abstract": "Resumen",
    "paper.keywords": "Palabras clave",
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
    "search.unavailable": "El índice de búsqueda no está disponible. Ejecutá «npm run build» y «npm run preview».",
    "search.hint": "Escribí al menos 2 letras para buscar en artículos, actividades y páginas.",
  },
  en: {
    "nav.search": "Search...",
    "home.latest": "Latest publications",
    "home.more": "See more",
    "footer.institucional": "About",
    "footer.menu": "Footer menu",
    "footer.contacto": "Contact",
    "footer.presentacion": "Presentation",
    "footer.sobre": "About Hyperborea",
    "paper.abstract": "Abstract",
    "paper.keywords": "Keywords",
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
    "search.unavailable": "The search index is not available. Run “npm run build” and “npm run preview”.",
    "search.hint": "Type at least 2 letters to search articles, activities and pages.",
  },
  fr: {
    "nav.search": "Rechercher...",
    "home.latest": "Dernières publications",
    "home.more": "Voir plus",
    "footer.institucional": "Institutionnel",
    "footer.menu": "Menu de pied de page",
    "footer.contacto": "Contact",
    "footer.presentacion": "Présentation",
    "footer.sobre": "À propos d’Hyperborea",
    "paper.abstract": "Résumé",
    "paper.keywords": "Mots-clés",
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
    "search.unavailable": "L’index de recherche n’est pas disponible. Lancez « npm run build » puis « npm run preview ».",
    "search.hint": "Saisissez au moins 2 lettres pour chercher dans les articles, activités et pages.",
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
