# Hyperborea

Revista de ensayo y creación (LabTIS, UNRN). Sitio estático en **Astro**, contenido en Markdown editado con **Sveltia CMS** sobre GitHub, búsqueda con **Pagefind**, alojado en **Cloudflare** (Workers con assets). Tres idiomas: `/es`, `/en`, `/fr`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (`localhost:4321`). La búsqueda no funciona aquí. |
| `npm run build` | Build completo: Astro + índice de búsqueda + redirecciones (`dist/`). |
| `npm run preview` | Sirve `dist/` (`localhost:4321`): búsqueda y redirecciones funcionan. |
| `npm run verify` | **Rutina de verificación completa** (ver abajo). `-- --offline` omite la comparación con Drupal. |
| `npm run import:all` | Reimporta todo desde Drupal (solo migración; sobrescribe `src/content`). |

Requiere Node ≥ 22.23.4.

## Las URLs no se pueden romper

Las URLs son idénticas a las del sitio Drupal original (sin barra final: `/es/paper/slug`, `/es/Mare_Sugenum`, `/es/numero-8`, `/sites/default/files/...`).

- La URL de cada contenido sale de su `slug` (frontmatter). **No lo cambies en contenido publicado.** Si debes hacerlo, agrega la dirección anterior en `aliases`.
- `aliases` (frontmatter, lista de rutas que empiezan con `/`) crea una redirección 301 hacia ese contenido. No hay configuración central de redirecciones.
- `/{idioma}/node/{translationKey}` (URL de sistema de Drupal) se redirige solo desde `translationKey`.
- Los archivos subidos viven en `public/sites/default/files/` (misma ruta que en Drupal).
- `scripts/build-redirects.mjs` (parte de `npm run build`) genera las páginas de redirección y `dist/_redirects` (301 reales en Cloudflare) y **falla el build** si un destino no existe o un alias taparía una página real.
- `scripts/legacy-urls.txt` es una captura congelada de las 608 URLs públicas del sitio antiguo. `npm run verify` comprueba que todas respondan.

- Las páginas de palabras clave (`/es/taxonomy/term/976`, 956 términos × 3 idiomas) conservan su URL. El vocabulario es `src/data/keywords/` (un archivo JSON por término, `{ name, tid }`): `tid` es el id antiguo de Drupal (si dos términos antiguos compartían nombre se unieron en uno, con el otro id en `alsoTids`: el menú del CMS exige nombres únicos; refrescable con `npm run import:terms`, que conserva los términos creados en el CMS; en el CMS la colección tiene buscador y orden alfabético). Los editores eligen las palabras clave de cada paper en un menú desplegable alimentado por ese vocabulario, y suman términos nuevos en el CMS, en «Vocabulario de palabras clave»; un término nuevo no tiene `tid` y su página es `/es/taxonomy/term/<nombre-en-slug>`. Cada página lista los papers cuyo `keywords` incluye ese nombre. No están en el sitemap (tampoco estaban en el antiguo).

## Contenido

- `src/content/{papers,articles,pages}/{es,en,fr}/<slug>.md`
- Orden dentro de un número: `issueOrder`. Portada: `featured` (1–6). Nuevo número: agregar su año en `src/data/issues.ts`.
- Secciones válidas: ver `src/data/nav.ts` (el campo `section` es una lista cerrada en el CMS).
- Notas al pie: se escriben como párrafos que empiezan por `[1] texto` (o `[*]`, `[**]`), bajo un título «Notas», y se enlazan desde el texto con `[[1]](#01)`. No hace falta escribir ningún `id`: `src/plugins/footnotes.mjs` se lo agrega a la nota al generar la página (la migración desde Drupal había perdido esos destinos). Si un link `#NN` no tiene nota con ese número, `npm run verify` lo lista en el check 6b.
  - Cada nota numerada recibe el id `01`, `02`… (aunque nada la enlace). Por eso el campo `author` puede terminar en `[1]` (p. ej. `Anthony Stanton[1]`): la página del paper lo muestra como link a la nota 1 y los listados de número muestran solo el nombre (`src/lib/author.ts`).
- HTML dentro del Markdown: `src/plugins/sanitize.mjs` lo limpia al generar la página (lista blanca de etiquetas y atributos; se eliminan `<script>`, `<iframe>`, `on*=`, `style=` y URLs `javascript:`). Usa solo lo que el contenido ya usa (figuras, tablas, `<a id>`). `npm test` cubre las reglas y el check 6c de `verify` revisa `dist/`. Un enlace Markdown con espacios dentro de `<…>` (`[x](< https://…>)`) genera una URL rota con `%20`: escríbelo sin espacios.

## Editores (Sveltia CMS)

Entrar en `/admin/` con un **token personal de GitHub** (fine-grained, solo este repo, permisos *Contents* y *Pull requests* de lectura y escritura). Los permisos de cada editor son su rol en el repositorio: el equipo de editores con rol **Write**, el administrador con **Admin**.

Flujo editorial activado: cada guardado abre un pull request y pasa por Borrador → Revisión → Listo; **Publicar** lo fusiona en `main` y Cloudflare despliega solo. Proteger `main` (Settings → Branches): exigir pull request y que solo el administrador pueda aprobar/fusionar.

Edición local sin GitHub: `npm run dev`, abrir `/admin/index.html` en Chrome/Edge y elegir *Work with Local Repository*.

Las imágenes nuevas se convierten a WebP (máx. 2048 px) y se limitan a 20 MB. Para reducir imágenes pesadas ya existentes: `node scripts/optimize-images.mjs` (`--dry` para simular).

## Despliegue (Cloudflare Workers con assets)

El sitio es un Worker (`wrangler.jsonc`): sirve `dist/` como archivos estáticos y ejecuta `worker/index.ts` solo para `/api/*` (formulario de contacto). Está conectado a este repo desde el dashboard de Cloudflare (Workers Builds):

- **Build command:** `npm run build` (Astro + búsqueda + redirecciones; con solo `astro build` no hay buscador ni redirecciones del sitio antiguo).
- **Deploy command:** `npx wrangler deploy`.
- Rama de producción `main`. Cada PR genera una vista previa.
- Límites: 25 MiB por archivo (el mayor hoy: 14 MB), 20 000 archivos (hoy ~5400) y 2000 redirecciones (hoy ~1150).
- Dominio: `hyperborea-labtis.org` (sin `www`) es el principal, el mismo que usa el canonical del sitio antiguo; `www.hyperborea-labtis.org` debe redirigir (301) a él. Para asignar un dominio propio al Worker, el DNS de ese dominio debe estar en Cloudflare.

### Indexación y SEO (`<head>`)

- **Interruptor:** la variable de build `PUBLIC_INDEXABLE` decide si el sitio se indexa. Sin ella (por defecto) **todas las páginas son `noindex, nofollow` y `robots.txt` deshabilita todo**: es lo correcto para el dominio de desarrollo (`workers.dev`) y las vistas previas. **Al lanzar hay que poner `PUBLIC_INDEXABLE=true` en Workers Builds → Settings → Build → Variables** (solo la rama `main` se indexa; las vistas previas de otras ramas quedan `noindex` aunque la variable exista). `npm run verify` avisa (check 10b) cuando el build no es indexable.
- **Canonical y hreflang** salen de `src/lib/seo.ts` (con tests) y los emite `BaseLayout.astro`: siempre URLs absolutas con el dominio `hyperborea-labtis.org`. Las páginas con texto propio en su idioma se indexan y enlazan solo las traducciones **reales** (hreflang). Una copia sin traducir (texto en español bajo `/en` o `/fr`) lleva `canonical` a la página `/es`, `noindex, follow` y no aparece en el sitemap; al agregar la traducción real se indexa sola. Las páginas de palabras clave se indexan solo en `/es`; el buscador y el 404 son `noindex`.
- **Sitemap** (`sitemap-index.xml`): solo páginas indexables. `robots.txt` lo genera `src/pages/robots.txt.ts`.
- **Iconos e imagen social** (`favicon.ico`, `apple-touch-icon.png`, `og-default.png`) son **provisionales**: se derivan del único logo disponible (GIF de 300×80). Cuando llegue el logo vectorial, reemplazar la fuente y ejecutar `node scripts/build-brand-assets.mjs`. Las páginas con imagen propia (papers, actividades) usan esa imagen en `og:image`.

### Formulario de contacto (`/es/contact`)

`worker/index.ts` envía el correo con Cloudflare Email Service (binding `send_email` llamado `EMAIL`, ya declarado en `wrangler.jsonc`) y lo protege con **Cloudflare Turnstile**, un límite de **5 envíos por minuto por IP** (binding `CONTACT_LIMITER`), verificación de `Origin` (solo el propio sitio), tope de 16 KB y honeypot. El destinatario es siempre `CONTACT_TO`; nada del formulario lo controla. Para activarlo:

1. Dominio habilitado para envío: `npx wrangler email sending enable <dominio>` (debe estar en Cloudflare).
2. **Widget de Turnstile** (dashboard → Turnstile → Add widget, con los hostnames del sitio). La **clave del sitio** es pública: va como variable de build `PUBLIC_TURNSTILE_SITEKEY` (Workers Builds → Variables). Sin ella la página muestra «formulario no disponible» en lugar del formulario: ese es el estado *suspendido*.
3. Tres **secretos** del Worker (no van en el repo, que es público): `CONTACT_TO` (buzón que recibe los mensajes), `CONTACT_FROM` (dirección del dominio habilitado) y `TURNSTILE_SECRET` (clave secreta del widget). `npx wrangler secret put CONTACT_TO`, etc., o en el dashboard: Worker → Settings → Variables and Secrets → tipo *Secret*. Si falta alguno el Worker responde 503 (`not_configured`).

Probar en local: copiar `.env.example` a `.env` con la clave de pruebas de Turnstile (`1x00000000000000000000AA`, siempre aprueba), crear `.dev.vars` (ignorado por git) con `CONTACT_TO`, `CONTACT_FROM` y `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`, ejecutar `npm run build` y `npx wrangler dev`. Los tipos del Worker (`Env`) se generan con `npm run types` desde `wrangler.jsonc` y `worker/secrets.example` (nombres de los secretos); no se escriben a mano. No declares los secretos con `secrets.required` en `wrangler.jsonc`: haría fallar el despliegue mientras falte alguno. Los errores del Worker se ven con `npx wrangler tail` (sin datos personales en los logs).

## Verificación

`npm run verify` ejecuta: build + type check, conteos contra Drupal, integridad de archivos, frontmatter/slugs/secciones, i18n, enlaces internos (sin barra final, sin rotos; y avisa de los `#enlaces` dentro de una página sin destino), configuración del CMS, índice de búsqueda y **paridad de URLs con el sitio antiguo**. Sale con código 1 si algo falla.

### Buscador (`/es/buscar`)

Búsqueda de texto completo con Pagefind (índice estático generado por `npm run build`; en `npm run dev` no hay índice). Se puede acotar por **Tipo** (paper / actividad / página), **Sección** y **Número** (estas dos solo existen en papers). Los filtros salen de `<meta data-pagefind-filter>` en las plantillas de paper, actividad y página, y se reflejan en la URL (`?q=…&tipo=…&seccion=…&numero=…`).

### Portada, secciones y paginado

- **Portada (`/es`)**: los 6 últimos papers de las secciones Mare Sugenum, Kino LabTIS, Manet et manebit y 41º 9’ S 71º 8’ W (por fecha; sin actividades ni Afinidades electivas) y un botón «Ver más» que lleva a `/es/posts-3-col`.
- **`/es/posts-3-col`**: todas las publicaciones (papers y actividades), de la más nueva a la más vieja, 6 por página con paginador. La página 1 es `/es/posts-3-col`; las demás, `/es/posts-3-col/2`, `/3`… Las URLs antiguas del paginado de Drupal (`?page=N`) redirigen a la página nueva.
- **Secciones**: Mare Sugenum, Kino LabTIS, Manet et manebit y 41º 9’ S 71º 8’ W muestran solo el número actual. **Afinidades electivas** (`allIssues: true` en `src/data/nav.ts`) muestra todos sus papers de todos los números, el más nuevo primero, 6 por página (`/es/Afinidades_electivas`, `/2`, `/3`…).
- **Orden "más nuevo primero"**: la portada, `/posts-3-col` y Afinidades electivas ordenan por `created` (fecha y hora de creación que tenían en Drupal, guardada en cada paper y actividad). Así el orden coincide con el sitio antiguo al minuto; `publishedDate` solo tiene el día y no alcanza (varios papers de un mismo número comparten fecha). Contenido nuevo creado en el CMS puede dejar `created` vacío: se usa `publishedDate`.
