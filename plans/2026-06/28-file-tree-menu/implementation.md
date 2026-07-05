# File Tree Menu Implementation

## Progress

[######] Done - implemented and validated; follow-ups noted below.

## Changes

- Added `scripts/source-tree.js` to scan the configured content root and write a
  versioned `source_entries` table into the existing SQLite database.
- Updated `scripts/collect.js` so successful collection also refreshes the
  source tree index before clearing cached HTML.
- Updated `src/layout/layout_utils.js` so the pages sidebar is built from
  `source_entries` when available and falls back to the previous document-only
  tree for older databases.
- Kept the app bar document-oriented so it only advertises renderable document
  sections.

## Decisions

- The `documents` table remains the renderable page contract.
- The `source_entries` table is the file-tree contract for navigation.
- Directory-style Markdown documents link from their directory entry. Non-root
  README-style source files are not duplicated as separate children.
- Non-renderable source files and folders are visible but do not get links.

## Follow-Up Risks

- `pnpm` is not available on PATH in this shell.
- The full `scripts/collect.js` path is still blocked by the existing linked
  `content-structure` Node 22 resolution issue before this new indexer runs.
  The new indexer was validated directly against the current database version.

## Follow-Up Changes

- Filtered the visible pages menu to rendered document routes plus their folder
  ancestors. The source index can still contain raw files, but the website
  navigation no longer shows non-rendered YAML, Python, SQL, lock, or other
  source-only files.
- Changed source-tree labels to prefer rendered document titles and strip the
  `.md` suffix for Markdown files, so the menu reads like source filenames
  without extension.
- File entries now keep source-style names even when the rendered document uses
  a different page title. The root `README.md` therefore appears as `README` in
  the file tree while the app bar can still show `Home`.
