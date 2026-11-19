// robots.txt depends on the build: only the production build (PUBLIC_INDEXABLE=true, see
// src/lib/indexing.ts) invites crawlers; the dev domain and PR previews disallow everything.
import type { APIRoute } from "astro";
import { INDEXABLE } from "../lib/indexing";

export const GET: APIRoute = ({ site }) => {
  const lines = INDEXABLE
    ? [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin/",
        "Disallow: /api/",
        "",
        `Sitemap: ${new URL("/sitemap-index.xml", site).href}`,
      ]
    : ["User-agent: *", "Disallow: /"];
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
