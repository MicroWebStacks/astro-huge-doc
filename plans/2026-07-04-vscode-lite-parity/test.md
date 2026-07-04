# Test Proof

## Commands Run

- `node --check scripts/source-tree.js`
  - Expected: shared source-tree scanner parses after removing the top-level
    native import.
  - Actual: passed.
- `node --check scripts/collect.js`
  - Expected: JSON collect wrapper parses with the new source-tree refresh.
  - Actual: passed.
- `node --check scripts/export-json.js`
  - Expected: SQLite-to-JSON export parses after adding `source_entries`.
  - Actual: passed.
- `node --check scripts/stage-engine.js`
  - Expected: engine staging script parses after adding `src/assets`.
  - Actual: passed.
- `node --check src/libs/structure-db-json.js`
  - Expected: JSON backend parses after exposing `source_entries`.
  - Actual: passed.
- `ASTRO_TELEMETRY_DISABLED=1 DOCS_PROFILE=lite DOCS_BACKEND=json node node_modules/astro/astro.js build`
  - Expected: lite build still succeeds.
  - Actual: passed.
- `DOCS_BACKEND=json node scripts/collect.js`
  - Expected: JSON collect writes `content.json` and refreshes `source_entries`.
  - Actual: passed; version `CSKLNCM`; `source-tree: indexed 134 entries in json dataset`.
- `node scripts/export-json.js`
  - Expected: exported JSON dataset includes `source_entries`.
  - Actual: passed; version `CSKLJYI`; `source_entries=134`.
- `DOCS_BACKEND=json node --input-type=module -e "...getSourceEntries()..."`
  - Expected: JSON dispatcher returns non-empty source-tree rows.
  - Actual: passed; `sourceEntries=134`, with `README.md` and `plans` present.
- `node scripts/stage-engine.js --out .tmp/stage-engine-test`
  - Expected: clean temp staging succeeds and includes runtime assets.
  - Actual: passed; staged `.tmp/stage-engine-test`.
- `Get-ChildItem .tmp/stage-engine-test/src/assets`
  - Expected: staged engine contains the SVG assets required by `SvgIcons`.
  - Actual: passed; asset files include `code.svg`, `diagram.svg`, and
    `full-screen.svg`.
- Lite server smoke:
  - Command: start `node server/server.js` with `DOCS_BACKEND=json`,
    then `Invoke-WebRequest http://127.0.0.1:4321/`.
  - Expected: rendered HTML contains file-tree entries from the JSON dataset.
  - Actual: passed; response HTML contained both `README` and `plans`.

## Known Gaps

- Staging to the default ignored folder `packages/md-render` failed in this
  shell with `EPERM` while unlinking the existing staged `package.json`.
  Staging to `.tmp/stage-engine-test` succeeded and was used as the packaging
  proof instead.
- This validation did not repackage or reinstall the VS Code extension because
  the extension code was unchanged. The runtime fix still needs a local
  `enginePath` or a republished engine package before an already installed
  extension will pick it up by default.
