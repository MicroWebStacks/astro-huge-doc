# Specification: File Tree Menu

## Scope

This contract governs the left pages menu rendered by `SideMenu.astro` when it
is used as the documentation file tree.

It applies to both runtime profiles:

- the full SQLite-backed website;
- the lite JSON-backed VS Code preview.

## Data Contract

The file tree is driven by `source_entries`, not by the renderable `documents`
list alone.

Each visible entry represents either:

- a renderable Markdown document; or
- a folder ancestor required to organize a renderable Markdown document.

Backends may store or derive `source_entries` differently, but they must expose
the same row shape to the layout:

- `path`
- `parent_path`
- `name`
- `entry_type`
- `document_url`
- `document_title`
- `document_url_type`
- `sort_order`

## Visibility Rules

The pages menu is document navigation, not a raw source explorer.

It must:

- show rendered Markdown routes;
- show the folder ancestors needed to place those routes in a source-like tree;
- omit raw source-only files that do not render as documentation pages.

If a backend cannot provide `source_entries`, the layout may fall back to the
older document-derived menu. That fallback is compatibility behavior, not the
preferred contract.

## Label Rules

- Renderable entries use their document title when it is meaningful; source
  names are the fallback for untitled entries and organizational folders.
- Markdown filenames are implementation detail and must not override a useful
  reader-facing title.
- Root and README-style documents use `Overview` when their title is missing,
  `.`, or merely repeats the source filename.
- Labels use the title's authored capitalization rather than forcing lowercase
  filename casing.
- The app bar may still label the root route as `Home`; that does not change the
  pages-tree reader-facing label rule.

## README Directory Rule

When a directory-style Markdown document resolves to the directory route, that
route belongs to the directory node itself. The menu must not create a
duplicate `README.md` child for that same route.

## Ordering

- Folders sort before files within the same parent.
- Renderable document order uses `sort_order` when available.
- Ties fall back to label/name ordering.

## Non-Goals

- The pages menu does not expose non-rendered YAML, lock files, scripts, or
  other source-only files.
- The pages menu is not required to show every on-disk file in the workspace.
