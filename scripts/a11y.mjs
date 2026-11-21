#!/usr/bin/env node
/**
 * Accessibility gate: drives the BUILT site (dist/) in Chromium and fails on regressions that the static
 * checks of `verify` cannot see. The site is served by `wrangler dev --local`, i.e. by the same asset
 * server as production (_headers, _redirects, html_handling, 404 page).
 *
 *   npm run build && npm run a11y             # whole sample
 *   npm run a11y -- --only=paper              # pages whose path contains "paper"
 *   npm run a11y -- --base=http://127.0.0.1:8799   # reuse a server that is already running
 *
 * What it checks (WCAG 2.2 AA):
 *   1. axe-core, tags wcag2a wcag2aa wcag21a wcag21aa wcag22aa best-practice, on a fixed sample of pages
 *      (3 homes, issue, papers with and without abstract, activity, institutional pages, listings,
 *      search with results, contact, keyword, 404, EN/FR copies) and with the dropdown menu open.
 *   2. Reflow (1.4.10): no horizontal scroll at 320 CSS px.
 *   3. Text spacing (1.4.12): with the WCAG spacing overrides no text gets clipped.
 *   4. Keyboard: the first Tab stop is the skip link and it works; every stop has a visible focus indicator
 *      (also with forced-colors) and is not hidden under the fixed header (2.4.7, 2.4.11); the submenu
 *      opens with the keyboard and Esc closes it and returns the focus (2.1.1, 1.4.13).
 *   5. prefers-reduced-motion: nothing animates or transitions.
 *   6. No Content-Security-Policy violation and no uncaught script error on any page.
 *
 * Exit code 1 if anything fails. Needs Chromium: `npx playwright install chromium`.
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { opt as option, startServer } from "./lib/serve.mjs";

const opt = (name) => option(process.argv.slice(2), name);

// The sample. Pick pages that exercise each template; keep it fixed so results are comparable over time.
const PAGES = [
  "/es",
  "/en",
  "/fr",
  "/es/numero-8",
  "/es/paper/aigokeros", // paper WITH an editorial abstract
  "/es/paper/ceguera-vegetal-ecologia-oscura-y-la-novela-aberrant-273", // paper without abstract
  "/es/actividad/cortometraje-cuadro",
  "/es/presentacion",
  "/es/accesibilidad", // the accessibility statement (an institutional page with lists and links)
  "/es/actividades",
  "/es/Afinidades_electivas",
  "/es/posts-3-col",
  "/es/taxonomy/term/10", // keyword page
  "/es/buscar?q=arte", // search with results (Pagefind)
  "/es/contact",
  "/es/editores/resumenes", // internal list for the editors (93 entries, long page)
  "/es/no-existe-esta-pagina", // 404
  "/en/paper/aigokeros", // untranslated copy: Spanish text under /en (noindex, canonical to /es)
  "/fr/paper/aigokeros",
  "/en/buscar",
  "/fr/contact",
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const only = opt("only");
const pages = only ? PAGES.filter((p) => p.includes(only)) : PAGES;

const failures = [];
const fail = (where, what) => {
  failures.push(`${where}: ${what}`);
  console.log(`   ✗ ${where}: ${what}`);
};
const section = (title) => console.log(`\n${title}`);

// ---------- helpers that run inside the page ----------
/** Focus indicator of the element that has the focus: outline (survives forced-colors) or box-shadow. */
const focusProbe = () => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
  const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const hit = document.elementFromPoint(cx, cy);
  const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
  return {
    key: `${el.tagName}|${el.getAttribute("href") ?? ""}|${el.id}|${label}`,
    label: `<${el.tagName.toLowerCase()}> ${label}`,
    outlineStyle: cs.outlineStyle,
    outlineWidth: parseFloat(cs.outlineWidth) || 0,
    boxShadow: cs.boxShadow,
    visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
    inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    covered: !!hit && !(el.contains(hit) || hit.contains(el)),
    coveredBy: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]}` : "",
  };
};

/** Content that the WCAG 1.4.12 spacing overrides push out of its box: clipped (overflow hidden) boxes. */
const clippedBoxes = () => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (!(cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible")) continue;
    if (cs.overflowY === "auto" || cs.overflowY === "scroll") continue; // scrollable: content stays reachable
    if (!el.textContent?.trim()) continue;
    if (el.clientWidth <= 1 && el.clientHeight <= 1) continue; // visually-hidden pattern: clipped on purpose
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}`);
    }
  }
  return out;
};

const SPACING = `*{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important}
p{margin-bottom:2em !important}`;

// ---------- run ----------
const server = await startServer();
console.log(`Server: ${server.base}  (${pages.length} pages)`);
const browser = await chromium.launch();

// Only the site itself: no external request (fonts…) makes the run flaky or leaks anything.
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  await ctx.route("**/*", (route) => (route.request().url().startsWith(server.base) ? route.continue() : route.abort()));
  return ctx;
}
async function open(ctx, url) {
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`.slice(0, 160)));
  const res = await page.goto(server.base + url, { waitUntil: "load" });
  if (url.includes("/buscar?q=")) await page.waitForSelector(".hb-search-result", { timeout: 15_000 }).catch(() => problems.push("search returned no results"));
  return { page, res, problems };
}

try {
  // 1-3, 6: axe, reflow, text spacing, CSP/script errors
  const strict = await context(); // CSP enforced: shows violations of the real policy
  const axeCtx = await context({ bypassCSP: true }); // axe and the style overrides are injected scripts/styles

  section("axe-core (WCAG 2.2 AA + best practices), reflow 320 px, text spacing, CSP");
  for (const url of pages) {
    const where = url;
    const expected404 = url.includes("no-existe");
    const a = await open(strict, url);
    if (!expected404 && !a.res?.ok()) fail(where, `HTTP ${a.res?.status()}`);
    if (expected404 && a.res?.status() !== 404) fail(where, `expected a 404, got ${a.res?.status()}`);
    for (const p of a.problems) fail(where, p);
    await a.page.close();

    const b = await open(axeCtx, url);
    const result = await new AxeBuilder({ page: b.page }).withTags(AXE_TAGS).analyze();
    for (const v of result.violations) {
      const nodes = v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ");
      fail(where, `axe ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help} — ${nodes}`);
    }

    await b.page.setViewportSize({ width: 320, height: 256 });
    const overflow = await b.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) fail(where, `reflow at 320 px: ${overflow}px of horizontal scroll`);

    await b.page.setViewportSize({ width: 1280, height: 800 });
    const before = new Set(await b.page.evaluate(clippedBoxes));
    await b.page.addStyleTag({ content: SPACING });
    for (const box of (await b.page.evaluate(clippedBoxes)).filter((x) => !before.has(x))) fail(where, `text spacing clips content: ${box}`);
    await b.page.close();
    if (!result.violations.length) console.log(`   ✓ ${url}`);
  }

  // axe again with the dropdown open (its colours/contrast only exist in that state)
  {
    const b = await open(axeCtx, "/es");
    await b.page.locator(".hb-caret-button").first().click();
    const result = await new AxeBuilder({ page: b.page }).withTags(AXE_TAGS).analyze();
    for (const v of result.violations) fail("/es (menu open)", `axe ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`);
    if (!result.violations.length) console.log("   ✓ /es with the dropdown open");
    await b.page.close();
  }

  // 4: keyboard
  section("Keyboard: skip link, focus indicator, focus not hidden, submenu");
  async function walk(url, { forced = false, max = 60 } = {}) {
    const where = `${url}${forced ? " (forced-colors)" : ""}`;
    const ctx = await context(forced ? { forcedColors: "active" } : {});
    const { page } = await open(ctx, url);
    const seen = new Set();
    let first = true;
    let stops = 0;
    for (let i = 0; i < max; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(focusProbe);
      if (!f) break; // focus left the page (browser UI)
      if (seen.has(f.key)) break; // cycled
      seen.add(f.key);
      stops++;
      if (first) {
        first = false;
        const skip = await page.evaluate(() => document.activeElement?.getAttribute("href"));
        if (skip !== "#main-content") fail(where, `the first Tab stop is not the skip link (${f.label})`);
      }
      if (!f.visible || !f.inViewport) fail(where, `focus stop not visible: ${f.label}`);
      const indicator = (f.outlineStyle !== "none" && f.outlineWidth >= 2) || (!forced && f.boxShadow !== "none");
      if (!indicator) fail(where, `no focus indicator on ${f.label} (outline ${f.outlineStyle} ${f.outlineWidth}px)`);
      if (f.covered) fail(where, `focus stop covered by ${f.coveredBy}: ${f.label}`);
    }
    if (stops < 8) fail(where, `only ${stops} Tab stops: keyboard walk did not get through the page`);
    else console.log(`   ✓ ${where}: ${stops} stops`);
    await ctx.close();
  }
  for (const url of ["/es", "/es/buscar", "/es/contact", "/en", "/es/paper/aigokeros"]) {
    if (!only || url.includes(only)) await walk(url);
  }
  if (!only || "/es".includes(only)) await walk("/es", { forced: true });

  {
    // skip link target takes the focus
    const ctx = await context();
    const { page } = await open(ctx, "/es");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const id = await page.evaluate(() => document.activeElement?.id);
    if (id !== "main-content") fail("/es", `the skip link does not move the focus to #main-content (focus on "${id}")`);
    else console.log("   ✓ skip link moves the focus to <main>");

    // submenu: opens with the keyboard, Tab enters it, Esc closes it and returns to the button
    const button = page.locator(".hb-caret-button").first();
    await button.focus();
    await page.keyboard.press("Enter");
    const open1 = await button.getAttribute("aria-expanded");
    const menuId = await button.getAttribute("aria-controls");
    const shown = await page.evaluate((i) => {
      const m = document.getElementById(i);
      return !!m && getComputedStyle(m).display !== "none" && getComputedStyle(m).visibility !== "hidden";
    }, menuId);
    if (open1 !== "true" || !shown) fail("/es", `the caret button does not open its submenu with Enter (aria-expanded=${open1}, visible=${shown})`);
    await page.keyboard.press("Tab");
    const insideMenu = await page.evaluate((i) => !!document.getElementById(i)?.contains(document.activeElement), menuId);
    if (!insideMenu) fail("/es", "Tab from the open caret button does not enter the submenu");
    await page.keyboard.press("Escape");
    const closed = await button.getAttribute("aria-expanded");
    const back = await page.evaluate(() => document.activeElement?.classList.contains("hb-caret-button"));
    if (closed !== "false" || !back) fail("/es", `Esc must close the submenu and return the focus to its button (aria-expanded=${closed}, focus on button=${back})`);
    if (open1 === "true" && shown && insideMenu && closed === "false" && back) console.log("   ✓ submenu: Enter opens, Tab enters, Esc closes and returns the focus");
    await ctx.close();
  }

  {
    // focus never lands under the fixed (scrolled) header: focus the in-text links of a long paper
    const ctx = await context();
    const { page } = await open(ctx, "/es/paper/ceguera-vegetal-ecologia-oscura-y-la-novela-aberrant-273");
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(600); // header shrink + --hb-header-h are published after 300 ms
    const links = page.locator("main a[href]");
    const n = Math.min(await links.count(), 25);
    let hidden = 0;
    for (let i = 0; i < n; i++) {
      await links.nth(i).focus();
      await page.waitForTimeout(30);
      const f = await page.evaluate(focusProbe);
      if (f?.covered) {
        hidden++;
        fail("paper (scrolled)", `focus hidden under ${f.coveredBy}: ${f.label}`);
      }
    }
    if (n < 3) fail("paper (scrolled)", `expected links in <main>, found ${n}`);

    // Going BACKWARDS is the case that matters: the browser reveals the previous stop at the top edge of
    // the viewport, exactly where the fixed header sits, unless scroll-padding-top reserves its height.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    await links.last().focus();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(30);
      const f = await page.evaluate(focusProbe);
      if (f?.covered) {
        hidden++;
        fail("paper (Shift+Tab)", `focus hidden under ${f.coveredBy}: ${f.label}`);
        break;
      }
    }
    if (n >= 3 && !hidden) console.log(`   ✓ the focus stays clear of the fixed header (${n} links forwards, 30 stops backwards)`);
    await ctx.close();
  }

  // 5: reduced motion
  section("prefers-reduced-motion");
  {
    const ctx = await context({ reducedMotion: "reduce" });
    const { page } = await open(ctx, "/es");
    await page.locator(".hb-nav-item").nth(1).hover();
    await page.waitForTimeout(100);
    const motion = await page.evaluate(() => {
      const long = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        const d = Math.max(...cs.transitionDuration.split(",").map(parseFloat), ...cs.animationDuration.split(",").map(parseFloat));
        if (d > 0.01) long.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${d}s`);
      }
      return { running: document.getAnimations().filter((a) => a.playState === "running").length, long: long.slice(0, 5) };
    });
    if (motion.running) fail("/es", `${motion.running} animations running with prefers-reduced-motion`);
    if (motion.long.length) fail("/es", `transitions/animations longer than 0.01 s with prefers-reduced-motion: ${motion.long.join(", ")}`);
    if (!motion.running && !motion.long.length) console.log("   ✓ no animation or transition runs");
    await ctx.close();
  }
} finally {
  await browser.close();
  server.stop();
}

console.log("");
if (failures.length) {
  console.log(`❌ ${failures.length} accessibility problem${failures.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("✅ accessibility gate passed");
