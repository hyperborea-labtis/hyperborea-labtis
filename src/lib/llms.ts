// /llms.txt: a short Markdown map of the journal for language models and other automatic readers
// (https://llmstxt.org). It says what the site is, under which licence its texts may be used, how to cite
// them and where the machine-readable sources are. Crawlers are welcome (robots.txt blocks nobody) on the
// terms of the licence; the page is built from the same data as the site, so it never goes stale.

import { JOURNAL } from "../data/journal.ts";

export interface LlmsInput {
  /** Origin of the site, e.g. https://hyperborea-labtis.org */
  site: string;
  issues: { n: number; year: number }[];
  sections: { label: string; path: string }[];
}

export function llmsTxt({ site, issues, sections }: LlmsInput): string {
  const url = (p: string) => new URL(p, site).href;
  const newestFirst = [...issues].sort((a, b) => b.n - a.n);
  const lines = [
    `# ${JOURNAL.name}`,
    "",
    `> Revista académica anual de ensayo y creación sobre literatura, artes visuales, cine y teatro, de acceso abierto. La edita el ${JOURNAL.publisher.name} de la ${JOURNAL.publisher.parent} (Viedma, Argentina). ISSN ${JOURNAL.issn}.`,
    "",
    "Los textos están en español (algunos en inglés o francés) y la interfaz está en español, inglés y francés. Una versión /en o /fr de un texto que no está traducido muestra el original en español, declara su idioma y apunta a la versión /es como canónica.",
    "",
    "## Licencia y uso",
    "",
    `- Licencia: Creative Commons Atribución-NoComercial-SinDerivadas 3.0 (CC BY-NC-ND 3.0), ${JOURNAL.license}`,
    "- Se pueden leer, citar y compartir con atribución, sin uso comercial ni obras derivadas.",
    "- Los rastreadores y los sistemas de IA son bienvenidos a leer y citar el sitio en esos términos: citen siempre a la autora o el autor, el título, la revista y la URL canónica de la página.",
    "",
    "## Cómo citar",
    "",
    `Autor/a. «Título». *${JOURNAL.name}*, N.º X (año). URL de la página del texto (empieza por ${url("/es/paper/")}).`,
    "",
    "## Números",
    "",
    ...newestFirst.map((i) => `- [Número ${i.n} (${i.year})](${url(`/es/numero-${i.n}`)})`),
    "",
    "## Secciones",
    "",
    ...sections.map((s) => `- [${s.label}](${url(`/es/${s.path}`)})`),
    "",
    "## Fuentes para máquinas",
    "",
    `- [Mapa del sitio](${url("/sitemap-index.xml")})`,
    ...["es", "en", "fr"].map((l) => `- [Canal RSS (${l})](${url(`/${l}/rss.xml`)})`),
    `- [Declaración de accesibilidad](${url("/es/accesibilidad")})`,
    `- [Contacto](${url("/es/contact")})`,
  ];
  return lines.join("\n") + "\n";
}
