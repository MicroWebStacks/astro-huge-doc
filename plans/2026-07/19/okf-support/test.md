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

## 2026-07-19 (Stage 3)

- Passed: `pnpm test` — 52/52, including five focused Stage 3 tests for folded `index.md` discovery, authored list hierarchy/synthesized entries, diagnostic reset/related paths, persisted JSON diagnostics, and the lite line scanner's frontmatter/fence/reference handling.
- Passed: JSON collection against `demo/` into `.tmp/okf-stage3/store` — 10 documents, 20 relations, diagnostics array present (empty for the clean fixture).
- Passed: SQLite collection against `demo/` into `.tmp/okf-stage3/sqlite-store` — both `diagnostics` and `relations` tables present; zero diagnostics and one intentionally unresolved relation for the clean fixture.
- Passed: full/json static Astro build into `.tmp/okf-stage3/static-full` — 17 pages including `/explore`, one type page, four tag pages, the unresolved-link report, linked concept facets, and server-rendered Contents/Files navigation from `knowledge/index.md`.

## 2026-07-21 — canonical Pages navigation

- Passed: `node --test test/layout-navigation.test.js` — 3/3, including the invariant that a directory landing `index.md` is represented by the linked directory node while sibling documents remain child entries.
- Passed: `node --test --test-name-pattern="navigation payload prefers" test/extension-preview-endpoints.test.js` — the lite endpoint returns the single persisted Pages tree.
- Passed: `node scripts/check-plans.js` — 32 packets checked; open/closed indexes are consistent.
- Passed: JavaScript syntax checks for `lazy_navigation.js`, `extension-preview.js`, and `source_navigation.js`; `git diff --check`; repository scans found no remaining authored-navigation imports, Contents/Files controls, or `source=contents` branches under `src/` and `test/`.
- Full `pnpm test` was attempted through Corepack: 27 tests passed and 10 suites could not load because the existing install lacks `glob` in the root and `packages/content-structure` dependency trees. The navigation-focused tests above passed independently.
- `pnpm build` was attempted with Astro telemetry disabled and could not start because the existing install lacks `esbuild`. The ignored staged engine under `packages/md-render/` was therefore not regenerated; run `pnpm ext:stage-engine` after dependencies are repaired and a successful build exists.
- Passed: lite static Astro build — lazy navigation skeleton, post-paint contents request code, and the in-page link-index status bar are present; Explore links remain omitted in lite.
- Passed: end-to-end lite scanner smoke test against all 10 demo documents — completed 10/10 with zero errors, 9,496 relation-store bytes, and zero evictions under the 10 MB cap.
- Passed: `pnpm build` for the lite SSR engine, followed by `pnpm ext:stage-engine`; staging completed with the current dirty build stamp and vendored production dependencies.
- Environment note: the workspace's pnpm junctions had to be repaired from the local package store, and validation commands ran outside the filesystem sandbox so Node could follow those Windows junctions.

Still not covered: interactive browser clicking of pause/resume/stop controls. Endpoint/state behavior and scanner completion were exercised directly. JSON server-mode deferred relation flushing remains postponed from DD-5.
