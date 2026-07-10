# Implementation

## Progress

[#####] Done - audited navigation and reading-surface polish implemented.

## Changes

- Updated the durable file-tree and outline specifications for reader-facing
  titles, visible menu headings, understandable depth controls, and mobile
  drawer behavior.
- Replaced filename labels with authored document titles and added visible
  `Pages` / `On this page` headings.
- Replaced transport-style depth symbols with `1`, minus, `Auto` / `Manual`,
  plus, and `All` labels while preserving existing state semantics.
- Implemented mutually exclusive mobile drawers with backdrop and Escape
  dismissal, focus restoration, independent persisted mobile state, and 44px
  app-bar targets.
- Removed the 400px app-bar minimum and constrained layout sizing so a 390px
  viewport has no document-level horizontal overflow.
- Added consistent menu row sizing, product-facing labels, adjacent inline-link
  spacing, and accessible names for heading permalinks.
- Corrected bottom-of-article outline tracking and the demo matrix row escaping
  required by the collection pipeline.

## Notes

- The existing user edit in `demo/readme.md` was preserved.
- Generated dataset/build output was refreshed only as validation input and is
  not part of the workflow packet.
