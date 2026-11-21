// Contrast guard for the design tokens in src/styles/hyperborea.css (WCAG 2.2 AA, SC 1.4.3 and
// 1.4.11). scripts/verify.mjs runs `colorProblems` on the stylesheet (check 20); the tests pin the
// maths. The point is that nobody can quietly lower a color token below its threshold, or use the
// plain brand yellow (2:1 on white) for text on a light surface.

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #rgb / #rrggbb colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#ffffff";
const PANEL = "#f4f7fb"; // the light panel behind the home's featured grid
const BLACK = "#000000";

// token, background, minimum ratio, what it is for
const PAIRS: [string, string, number, string][] = [
  ["--hb-yellow-text", WHITE, 4.5, "yellow-ish text on white"],
  ["--hb-yellow-text", PANEL, 4.5, "yellow-ish text on the light panel"],
  ["--hb-yellow-large", WHITE, 3, "large bold yellow-ish text on white"],
  ["--hb-yellow-large", PANEL, 3, "large bold yellow-ish text on the light panel"],
  ["--hb-control-border", WHITE, 3, "form control borders"],
  ["--hb-muted", WHITE, 4.5, "secondary text"],
  ["--hb-yellow", BLACK, 4.5, "yellow text on the black header"],
];

// Selectors (prefixes) where the plain brand yellow may color text: they all sit on the black header.
const DARK_SURFACE = /^\.hb-(nav|caret|submenu|search|lang)\b/;

export function colorProblems(css: string): string[] {
  const problems: string[] = [];
  const tokens = new Map<string, string>();
  for (const m of css.matchAll(/(--hb-[\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) tokens.set(m[1], m[2]);

  for (const [token, bg, min, use] of PAIRS) {
    const value = tokens.get(token);
    if (!value) {
      problems.push(`${token} is missing from the stylesheet (${use})`);
      continue;
    }
    const ratio = contrastRatio(value, bg);
    if (ratio < min) problems.push(`${token} ${value} on ${bg}: ${ratio.toFixed(2)}:1, needs ${min}:1 (${use})`);
  }

  // The plain yellow as a text color, outside the dark surfaces.
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(?:^|[;\s])color:\s*var\(--hb-yellow\)/.test(rule[2])) continue;
    for (const sel of rule[1].split(",").map((s) => s.trim().replace(/^[\s\S]*\*\/\s*/, ""))) {
      if (sel && !DARK_SURFACE.test(sel)) problems.push(`${sel} colors text with --hb-yellow (2:1 on white): use --hb-yellow-text`);
    }
  }
  return problems;
}
