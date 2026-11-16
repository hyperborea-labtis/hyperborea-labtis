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
- Dominio: `www.hyperborea-labtis.org` como principal; el dominio sin `www` debe redirigir a `www`. Para asignar un dominio propio al Worker, el DNS de ese dominio debe estar en Cloudflare.

### Formulario de contacto (`/es/contact`)

`worker/index.ts` envía el correo con Cloudflare Email Service (binding `send_email` llamado `EMAIL`, ya declarado en `wrangler.jsonc`). Falta:

1. Dominio habilitado para envío: `npx wrangler email sending enable <dominio>` (debe estar en Cloudflare).
2. Dos **secretos** del Worker (no van en el repo, que es público): `CONTACT_TO` (buzón que recibe los mensajes) y `CONTACT_FROM` (dirección del dominio habilitado). `npx wrangler secret put CONTACT_TO` y `npx wrangler secret put CONTACT_FROM`, o en el dashboard: Worker → Settings → Variables and Secrets → tipo *Secret*.

Mientras tanto el Worker responde 503 (`not_configured`) y la página muestra un error al enviar.

## Verificación

`npm run verify` ejecuta: build + type check, conteos contra Drupal, integridad de archivos, frontmatter/slugs/secciones, i18n, enlaces internos (sin barra final, sin rotos), configuración del CMS, índice de búsqueda y **paridad de URLs con el sitio antiguo**. Sale con código 1 si algo falla.

### Buscador (`/es/buscar`)

Búsqueda de texto completo con Pagefind (índice estático generado por `npm run build`; en `npm run dev` no hay índice). Se puede acotar por **Tipo** (paper / actividad / página), **Sección** y **Número** (estas dos solo existen en papers). Los filtros salen de `<meta data-pagefind-filter>` en las plantillas de paper, actividad y página, y se reflejan en la URL (`?q=…&tipo=…&seccion=…&numero=…`).

### Portada, secciones y paginado

- **Portada (`/es`)**: los 6 últimos papers de las secciones Mare Sugenum, Kino LabTIS, Manet et manebit y 41º 9’ S 71º 8’ W (por fecha; sin actividades ni Afinidades electivas) y un botón «Ver más» que lleva a `/es/posts-3-col`.
- **`/es/posts-3-col`**: todas las publicaciones (papers y actividades), de la más nueva a la más vieja, 6 por página con paginador. La página 1 es `/es/posts-3-col`; las demás, `/es/posts-3-col/2`, `/3`… Las URLs antiguas del paginado de Drupal (`?page=N`) redirigen a la página nueva.
- **Secciones**: Mare Sugenum, Kino LabTIS, Manet et manebit y 41º 9’ S 71º 8’ W muestran solo el número actual. **Afinidades electivas** (`allIssues: true` en `src/data/nav.ts`) muestra todos sus papers de todos los números, el más nuevo primero, 6 por página (`/es/Afinidades_electivas`, `/2`, `/3`…).
