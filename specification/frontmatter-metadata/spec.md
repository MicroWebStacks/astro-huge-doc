# Specification: Frontmatter Metadata and Rendering

## Scope

This contract defines which Markdown frontmatter keys change what the engine
renders, and which are carried as inert metadata. It applies to every engine
profile, backend, and output mode: a key that changes rendering must change it
identically in `full`/`sqlite`, `full`/`json`, and `lite`/`json`.

Frontmatter's role in *document identity* — which keys may name, order, or
route a document — is governed by
`specification/engine-profiles/spec.md` and is not restated here. The toc
menu's own behavior once it is shown is governed by
`specification/toc-menu-controls/spec.md`.

## Storage contract

Collection splits frontmatter against the `documents` table columns declared in
the catalog:

- keys matching a non-identity document column become columns on the document
  row (`type`, `description`, `resource`, `tags`, `date`, `lastmod`, `format`);
- every other key is serialized into `meta_data`.

Page rendering receives one flattened object, the document row overlaid with
its `meta_data`, so a rendering key is read the same way regardless of which
side of that split it landed on. Adding a rendering key must not require a new
column.

## Keys that change rendering

| Key | Effect |
| --- | --- |
| `title` | Display label for the page heading, browser title, menus, cards. |
| `order` | Position among siblings in the pages menu; unset sorts alphabetically. |
| `description` | Metadata panel body and card subtitle. |
| `image` | Card thumbnail. Rewritten to an asset uid at collect time. |
| `tags` | Chips on the metadata panel; facets under `/explore/tags`. |
| `type` | Concept badge on the metadata panel; facets under `/explore/types`. |
| `resource` | External reference row on the metadata panel. |
| `date`, `lastmod` | Date shown on the metadata panel. |
| `features` | Bullet list on the page's card. |
| `format` | Selects the card-document rendering path (`markdown_card`). |
| `toc` | Outline pane visibility — see below. |

## `toc`

`toc` is an author opt-out of the **On this page** outline. It is a switch, not
a request to build one:

- absent, or any value other than false: the outline pane is shown whenever the
  page has at least one heading — the existing default;
- **false**: the page renders with no outline pane at all, regardless of how
  many headings it has;
- true on a page with no headings still shows nothing, because there is nothing
  to outline.

The values `false`, `"false"`, `"no"`, `"off"`, `"0"`, and `0` all count as
false, so content authored for other static-site generators keeps its intent
instead of being read as truthy.

Suppression covers the whole right-hand rail as one unit, because a control
that opens an empty pane is worse than no control:

- the outline pane itself;
- the app bar's right-hand toggle button;
- the desktop resize handle between the article and the rail;
- the mobile outline drawer reachable from that toggle.

`toc` is a render directive, so it is not listed as a field in the page's
metadata panel — the reader sees its effect directly.

## Keys carried but not honored

Keys not in the table above are stored and displayed as generic metadata rows;
they must not acquire rendering behavior implicitly.

`draft` is the one deliberate abstention worth naming. Content in this
repository carries `draft: false`, and other generators read `draft: true` as
"exclude from the build". The engine currently ignores the key entirely: a
`draft: true` page renders and appears in navigation exactly like any other. If
that behavior is ever wanted it must be specified first, because excluding a
document affects routing, the pages menu, static path enumeration, and
relations — not just this page's rendering.

## Non-goals

- No site-wide default that forces an outline onto pages, and no `toc` value
  that fabricates headings.
- No per-page override of toc depth, mode, or persisted expansion state; those
  belong to `specification/toc-menu-controls/spec.md` and stay reader-owned.
