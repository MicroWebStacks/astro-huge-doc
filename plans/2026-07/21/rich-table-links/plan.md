# Rich links in Markdown tables

## Problem summary

Markdown table cells retain complex MDAST when they contain links, but the
interactive React table reduces every cell to plain text before rendering.
This drops link destinations and bypasses the established internal, external,
resolved, and unresolved link behavior. The lite backend also classifies only
top-level link items, so links nested in table AST are absent from its parsed
relation index.

## Goal

Render labelled and bare URLs in Markdown table cells as proper links without
changing the existing plain JSON table asset format or sacrificing sorting,
alignment, overflow, and full-view behavior.

## Scope

- Add demo coverage for external, bare, internal, and unresolved links in a
  table.
- Extract a shared server-side link presentation policy from `Link.astro`.
- Derive a serializable rich-cell render model from stored table AST while
  retaining plain text as the sorting value.
- Render an allowlisted subset of inline MDAST safely in React.
- Recursively classify and index links nested in table AST in the lite profile.
- Add focused collection, rendering-model, and lite relation tests.

## Non-goals

- Changing the table asset blob schema or existing plain JSON/XLSX table flow.
- Rendering arbitrary raw HTML from table cells.
- Adding interactive content other than safe inline Markdown presentation.

## Implementation phases

1. Add the demo fixture and regression tests.
2. Add shared link presentation and rich table-cell model generation.
3. Add safe React token rendering while preserving text-based sorting.
4. Extend lite nested-link classification/indexing and validate all paths.

## Dependencies and risks

- Shared link behavior must preserve base-prefixed internal routes and the
  unresolved-link affordance.
- Rich display data must not become the TanStack sort key.
- Lite relation collection must not double-count ordinary top-level links.
- Existing table assets must remain readable without migration.

## Exit criteria

- All demo table-link cases render with the same semantics as prose links.
- Existing plain table assets continue to render unchanged.
- Sorting uses visible cell text.
- Nested table links participate in lite relation resolution.
- Focused tests, the full test suite, the production build, and plan checks pass.
