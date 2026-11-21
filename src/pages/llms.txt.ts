// /llms.txt, see src/lib/llms.ts.
import type { APIRoute } from "astro";
import { ISSUE_NUMBERS, ISSUE_YEARS } from "../data/issues";
import { ALL_SECTIONS } from "../data/nav";
import { llmsTxt } from "../lib/llms";

export const GET: APIRoute = ({ site }) => {
  const body = llmsTxt({
    site: site!.origin,
    issues: ISSUE_NUMBERS.map((n) => ({ n, year: ISSUE_YEARS[n] })),
    sections: ALL_SECTIONS,
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
