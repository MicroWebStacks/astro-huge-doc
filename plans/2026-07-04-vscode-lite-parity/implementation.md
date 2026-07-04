# Implementation: VS Code Lite Parity

## Progress

[######] Done - implemented and validated; deploy caveat noted below.

## Changes

- Added `specification/file-tree-menu/spec.md` so the pages-menu file-tree
  contract is durable across full and lite runtimes.
- Refactored `scripts/source-tree.js` so source-tree scanning can run without a
  top-level `better-sqlite3` import. The SQLite path now loads
  `better-sqlite3` lazily, and the shared scanner is reusable for JSON output.
- Updated `scripts/collect.js` so JSON/lite collect writes `source_entries`
  into `dataset/json/content.json` after the content-structure JSON export
  completes.
- Updated `scripts/export-json.js` so SQLite-to-JSON export also includes
  `source_entries`.
- Updated `src/libs/structure-db-json.js` so the lite backend returns exported
  `source_entries` instead of always falling back to the document-only menu.
- Updated `scripts/stage-engine.js` so staged engines include `src/assets`,
  which `SvgIcons` reads at runtime for the diagram toolbar icons.

## Notes

- This patch restores parity inside the lite/json runtime; it does not change
  the extension's design choice to run with `DOCS_PROFILE=lite` and
  `DOCS_BACKEND=json`.
- The extension package itself was not changed in this pass. An already
  installed extension still needs either:
  - `microwebstacks.preview.enginePath` pointed at a patched local engine; or
  - a newly staged/published engine version that the installed extension can
    resolve.
- In this shell, staging to the default ignored folder `packages/md-render`
  failed with `EPERM` while unlinking the old staged `package.json`. Staging to
  a clean `.tmp` output path succeeded and proved the asset-packaging fix.
