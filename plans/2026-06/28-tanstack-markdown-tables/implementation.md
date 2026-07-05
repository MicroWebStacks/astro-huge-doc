# Implementation

## Progress

[####] Done - implemented and validated; follow-ups noted below.

## Changes

- Replaced `src/components/markdown/table/DataTable.astro` with an Astro shell
  that passes mdast and asset fallback data into a React client component.
- Added `src/components/markdown/table/MarkdownTable.jsx` using
  `@tanstack/react-table` core and sorted row models.
- Added `src/components/markdown/table/MarkdownTable.css` for plain markdown
  table styling aligned to existing theme tokens.
- Removed the stale DataTables browser script.
- Removed the direct `datatables.net-dt` dependency from package metadata and
  lockfile entries.

## Decisions

- Prefer mdast input for markdown tables because current collected JSON table
  assets can lose heading/cell structure.
- Keep sorting as the only table interaction for now.
- Leave the `/tables` server-table page untouched because it already uses
  React table tooling and is a separate data browser surface.

## Validation Notes

See `test.md`.

## Follow-Up Risks

- The in-app browser tool failed during setup with a missing sandbox metadata
  field, and local Edge headless crashed or hung in this environment. Localhost
  verification therefore used the real running server plus HTML assertions,
  not an interactive browser click test.
