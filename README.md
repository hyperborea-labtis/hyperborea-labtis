# Hyperborea

Revista de ensayo y creación (LabTIS, UNRN). Sitio estático en **Astro**, contenido en Markdown editado con **Sveltia CMS** sobre GitHub, búsqueda con **Pagefind**, alojado en **Cloudflare Pages**. Tres idiomas: `/es`, `/en`, `/fr`.

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

Fuera de alcance por ahora: las páginas de palabras clave (`/es/taxonomy/term/N`, ~888) no están en el sitemap antiguo y no se reprodujeron; las 5 secciones sí.

## Contenido

- `src/content/{papers,articles,pages}/{es,en,fr}/<slug>.md`
- Orden dentro de un número: `issueOrder`. Portada: `featured` (1–6). Nuevo número: agregar su año en `src/data/issues.ts`.
- Secciones válidas: ver `src/data/nav.ts` (el campo `section` es una lista cerrada en el CMS).

## Editores (Sveltia CMS)

Entrar en `/admin/` con un **token personal de GitHub** (fine-grained, solo este repo, permisos *Contents* y *Pull requests* de lectura y escritura). Los permisos de cada editor son su rol en el repositorio: el equipo de editores con rol **Write**, el administrador con **Admin**.

Flujo editorial activado: cada guardado abre un pull request y pasa por Borrador → Revisión → Listo; **Publicar** lo fusiona en `main` y Cloudflare despliega solo. Proteger `main` (Settings → Branches): exigir pull request y que solo el administrador pueda aprobar/fusionar.

Edición local sin GitHub: `npm run dev`, abrir `/admin/index.html` en Chrome/Edge y elegir *Work with Local Repository*.

Las imágenes nuevas se convierten a WebP (máx. 2048 px) y se limitan a 20 MB. Para reducir imágenes pesadas ya existentes: `node scripts/optimize-images.mjs` (`--dry` para simular).

## Despliegue (Cloudflare Pages)

1. Workers & Pages → Create → Pages → conectar `hyperborea-labtis/hyperborea-labtis`.
2. Build command `npm run build`, output directory `dist`, rama de producción `main`.
3. Dominio: `www.hyperborea-labtis.org` como principal; el dominio sin `www` debe redirigir a `www` (Redirect Rule en Cloudflare).
4. Cloudflare Pages limita a 25 MiB por archivo (el mayor hoy: 14 MB) y a 2000 redirecciones (hoy ~1150).

### Formulario de contacto (`/es/contact`)

`functions/api/contact.ts` envía el correo con Cloudflare Email Service. Falta configurarlo (no está probado): dominio habilitado para envío (`wrangler email sending enable <dominio>`), binding `send_email` llamado `EMAIL` en el proyecto de Pages y variables `CONTACT_TO` (buzón de la revista) y `CONTACT_FROM` (dirección del dominio). Mientras tanto la función responde 503 y la página muestra un error al enviar.

## Verificación

`npm run verify` ejecuta: build + type check, conteos contra Drupal, integridad de archivos, frontmatter/slugs/secciones, i18n, enlaces internos (sin barra final, sin rotos), configuración del CMS, índice de búsqueda y **paridad de URLs con el sitio antiguo**. Sale con código 1 si algo falla.
