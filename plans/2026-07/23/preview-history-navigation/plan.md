# Preview History Navigation

## Problem

VS Code's Back/Forward actions return focus to Markdown source editors because
the rendered preview is a webview panel beside those editors. The preview has
no local history controls, and editor-follow navigation replaces its iframe,
so ordinary iframe history cannot reliably span rendered-page changes.

## Goal

Add preview-local Back and Forward controls on the right side of the breadcrumb
band. They navigate only among rendered preview pages, including routes reached
through active-editor following and links clicked inside the rendered site.

## Scope

- Keep route history per workspace preview session.
- Record editor-follow routes and same-preview link navigation.
- Bridge breadcrumb actions and route notifications through the webview
  wrapper without exposing general page-to-extension messaging.
- Disable Back or Forward when that direction has no entry.
- Preserve the route and history through preview-server restarts.
- Keep the controls extension-preview-only and hide them in link-preview
  thumbnails.

## Non-Goals

- Changing VS Code's global navigation history.
- Editor/preview scroll synchronization.
- Previous/next ordering across the documentation tree; these controls follow
  visit history, not source order.

## Exit Criteria

- Back/Forward remain within rendered preview routes.
- Navigating after going back truncates the old forward branch.
- Controls are keyboard accessible and occupy the breadcrumb band's right edge.
- Focused history, markup, and build validation passes or any environment gap
  is recorded.
