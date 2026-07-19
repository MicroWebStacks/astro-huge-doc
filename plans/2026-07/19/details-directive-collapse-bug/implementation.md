# Implementation

## Progress

[######] Done - stale lite page records are invalidated automatically and the real page renders one build-log code block inside its matching details element.

## Changes

- Bumped `src/libs/structure-db-lazy.js` page-record version from 2 to 3.
  Version-2 records predate the flattened container-directive `childCount`
  payload and are no longer compatible with the renderer.
- Added `test/details-directive-cache.test.js`. The test writes a hash-matching
  version-2 cache record with the old `ast.children` shape, loads it through
  the real lite backend, and proves the backend reparses it into
  `childCount: 1` rather than accepting the stale record.

## Root Cause

The earlier writer and renderer change updated the persisted item schema but
did not update the lazy cache's `RECORD_VERSION`. Since `sound.md` itself had
not changed, its content hash still matched and the lite backend loaded the old
page record from disk. That old directive row had `children` but no
`childCount`; the new renderer therefore nested zero rows and later rendered
the highlighted code row at top level.

## Notes

- No manual cache deletion is required. The first request under the updated
  engine rejects a version-2 record, reparses the Markdown, and persists a
  version-3 record.
- The unrelated existing change in
  `src/components/panzoom/lib_panzoommodal.js` was left untouched.
