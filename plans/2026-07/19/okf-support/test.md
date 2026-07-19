# Validation notes

## 2026-07-19

- Passed: direct `parseMarkdownFrontmatter()` smoke test with a YAML alias error; it recovered `title` and retained the Markdown body.
- Passed: `node --check packages/content-structure/src/collect.js` and `node --check packages/content-structure/src/frontmatter.js`.
- Passed: `node scripts/check-plans.js` (31 packets; indexes consistent).
- Not run: `pnpm test` and the full collect/build. `pnpm` is not on PATH, and `corepack pnpm` aborts because the installed workspace package links are incomplete (`packages/content-structure/node_modules/glob` is missing). No dependency installation was attempted.
