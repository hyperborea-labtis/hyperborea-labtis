// Facts about the journal and its publisher, used in scholarly metadata (citation_* tags) and
// JSON-LD. The address and names are the ones the old Drupal site published in its own JSON-LD.
export const JOURNAL = {
  /** Full title, as the journal cites itself: "Hyperborea. Revista de ensayo y creación 4 (2021)". */
  name: "Hyperborea. Revista de ensayo y creación",
  shortName: "Hyperborea",
  issn: "2618-4397",
  /** Creative Commons license of every paper (also shown in the page footer). */
  license: "https://creativecommons.org/licenses/by-nc-nd/3.0/",
  publisher: {
    name: "Laboratorio Texto, imagen y sociedad [LabTIS]",
    alternateName: "LabTIS",
    parent: "Universidad Nacional de Río Negro",
    address: {
      streetAddress: "Belgrano 526",
      addressLocality: "Viedma",
      addressRegion: "Provincia de Río Negro",
      postalCode: "8500",
      addressCountry: "AR",
    },
  },
} as const;
