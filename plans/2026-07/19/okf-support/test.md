# Validation notes

## 2026-07-19

- Passed: direct `parseMarkdownFrontmatter()` smoke test with a YAML alias error; it recovered `title` and retained the Markdown body.
- Passed: `node --check packages/content-structure/src/collect.js` and `node --check packages/content-structure/src/frontmatter.js`.
- Passed: `node scripts/check-plans.js` (31 packets; indexes consistent).
- Not run: `pnpm test` and the full collect/build. `pnpm` is not on PATH, and `corepack pnpm` aborts because the installed workspace package links are incomplete (`packages/content-structure/node_modules/glob` is missing). No dependency installation was attempted.

## 2026-07-19 (continued — Stages 1+2)

The earlier environment blocker is gone: `pnpm` is on PATH and `pnpm install` completes, so everything below ran for real.

- Passed: `pnpm test` — 47/47 (36 pre-existing + 11 new in `test/okf-identity.test.js` and `test/okf-relations.test.js`): slugified path identity, `slug` override, all landing-priority combinations, OKF field promotion with `timestamp`→`date`, relation classification (relative / root-absolute / fragment / external / asset / public / missing / anchor), directory-landing and `.md` fallbacks, case-sensitive + URL-decoded matching, root-escape handling.
- Passed: JSON collect against `demo/` (`MICROWEBSTACKS_DOCS_ROOT=demo DOCS_BACKEND=json node scripts/collect.js`): 10 documents, 20 relations (17 resolved, 1 asset, 1 external, 1 intentionally unresolved `./missing-concept.md`); `knowledge/index.md` landed the folder route with `knowledge/readme` demoted; typed columns populated.
- Passed: static Astro build on the **lazy/lite** backend (the workspace `.env` pins `DOCS_PROFILE=lite`), 11 pages: concept header, breadcrumb, relations footer, `unresolved` link class, frontmatter panel, log app-bar icon, and log timeline all present in the built HTML.
- Passed: static Astro build on the **full/json** backend (`.env` temporarily moved aside, restored after): resolved concept links rewritten to routes with fragments (`/knowledge/release-checklist#release-steps`), `concept`/`external`/`unresolved` classes, contextual backlinks ("under '2026-07-19'"), prev/next footer.
- Failed then fixed: **sqlite** collect crashed with `SQLite3 can only bind numbers, strings, ...` — unquoted YAML dates arrive as `Date` objects. After the `formatColumnValue` fix: sqlite collect passes; `relations` table holds the same 17/1/1/1 status distribution and the backlink join over `relations × documents` returns the expected four referencing pages for the typed concept.
- Re-ran `pnpm test` (47/47) and `node scripts/check-plans.js` after the fix.

Not covered yet: interactive extension-preview session against the relations store (only exercised through the lazy-backend static build), and the JSON server-mode deferred flush noted as postponed in implementation.md.
