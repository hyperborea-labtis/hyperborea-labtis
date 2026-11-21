// robots.txt depends on the build: only the production build (PUBLIC_INDEXABLE=true, see
// src/lib/indexing.ts) invites crawlers; the dev domain and PR previews disallow everything.
import type { APIRoute } from "astro";
import { INDEXABLE } from "../lib/indexing";

export const GET: APIRoute = ({ site }) => {
  const lines = INDEXABLE
    ? [
        // Nobody is blocked, AI crawlers included: they may read and cite the site under the licence
        // described in /llms.txt (CC BY-NC-ND). Only the CMS and the API are off limits.
        "# Crawlers, AI crawlers included, may read and cite this site under its licence (CC BY-NC-ND 3.0):",
        "# see /llms.txt.",
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
