# TanStack Markdown Tables

## Problem Summary

Markdown table rendering currently hydrates `datatables.net-dt` in the browser.
That adds search, pagination, and jQuery/DataTables styling around content that
only needs to read as clean markdown tables.

## Goal

Replace DataTables.net for markdown table items with a React TanStack Table
renderer that keeps semantic table markup, headings, and lightweight sortable
headers.

## Scope

- Replace the markdown table browser script with a React component using
  `@tanstack/react-table`.
- Render table headings and rows from the original markdown AST when present.
- Keep an asset-URL fallback for table data that does not include mdast.
- Remove the direct `datatables.net-dt` dependency and stale script.
- Preserve the separate `/tables` server-table page and its existing Mantine
  React Table behavior.

## Non-Goals

- No search panes, global search, or pagination for markdown tables.
- No changes to collection, asset generation, or markdown parsing semantics.
- No changes to the server-side `/api/tables` endpoint.

## Risks

- Current collected table assets can be lossy, so mdast rendering is preferred
  for normal markdown tables.
- The local package manager is available only through Corepack and may need the
  pinned pnpm version to avoid store mismatch.

## Exit Criteria

- No markdown rendering path imports `datatables.net-dt`.
- `pnpm-lock.yaml` and `package.json` no longer list the direct DataTables
  dependency.
- `pnpm build` passes.
- A local browser render shows markdown tables with headings and without
  DataTables search/pagination UI.
