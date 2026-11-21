// ESLint (flat config). `npm run lint` is part of CI. Rules in force:
//  - typescript-eslint recommended, and no `any` (project rule)
//  - eslint-plugin-astro with the jsx-a11y rules for templates (alt text, labels, valid anchors, roles…): the
//    markup-level companion of the browser gate in scripts/a11y.mjs
//  - plain JS/MJS (scripts, tests, plugins, worker) with the ESLint recommended set
import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "public/**",
      "src/content/**",
      "src/data/image-manifest.json",
      "worker/worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  ...astro.configs["flat/jsx-a11y-recommended"],
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // `_x` marks a parameter that is required by a signature and deliberately unused.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Functions passed to page.evaluate() in the browser gate run inside the page.
    files: ["scripts/a11y.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // <script> blocks of .astro files and the client code run in the browser.
    files: ["**/*.astro"],
    languageOptions: { globals: { ...globals.browser } },
  },
);
