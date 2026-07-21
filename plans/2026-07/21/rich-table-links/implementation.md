# Rich links in Markdown tables - implementation

## Progress

[####] Done - rich table links implemented and validated without changing the table asset schema.

## Changes made

- Added external, bare, internal, and unresolved table-link fixtures to
  `demo/link-examples.md`.
- Extracted prose/table link classification into
  `src/components/markdown/link-presentation.js` and shared its visual rules
  through `Link.css`.
- Added `rich-table.js`, which derives serializable inline render tokens and a
  separate plain-text sort key from the already-stored complex table AST.
- Updated the TanStack React renderer to render allowlisted inline Markdown
  tokens without HTML injection. Columns with linked headers disable their
  sort button to avoid nested interactive controls.
- Kept JSON/XLSX and plain Markdown table asset loading unchanged; rich content
  is a render-time model layered over the existing complex AST.
- Added pure AST link traversal/relation helpers and extended the lite parser
  to classify, rewrite, and index links nested in table AST.
- Bumped the lite page-record version from 4 to 5 so cached pages created
  before nested table-link resolution are reparsed.

## Decisions

- Link resolution remains server-side. The client island receives only a
  serializable presentation model and never imports database/config code.
- Sorting continues to use visible cell text, not token objects or hrefs.
- Raw HTML and unknown nodes remain inert text; no `dangerouslySetInnerHTML`
  path was introduced.
- Existing unrelated layout/footer/link-preview working-tree changes were not
  modified.

## Follow-up risks

- Images inside rich table cells still degrade to their alt text; image support
  was outside this link-focused packet.
