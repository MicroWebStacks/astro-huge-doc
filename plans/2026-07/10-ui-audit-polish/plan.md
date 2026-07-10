# Plan: UI audit polish

## Problem

The screenshot-backed UI audit found a strong documentation shell with gaps in
mobile navigation, menu language and hierarchy, touch targets, focus behavior,
scroll tracking, and a few visible content details.

## Goal

Bring the existing three-pane reader to a polished, consistent baseline without
replacing its established navigation model or token-driven design system.

## Scope

1. Update durable page-tree and outline contracts for reader-facing labels,
   understandable controls, and mobile drawers.
2. Improve menu headings, copy, control sizing, focus states, and resize-handle
   discoverability.
3. Remove mobile horizontal overflow and implement mutually exclusive Pages and
   On this page drawers with backdrop and Escape dismissal.
4. Fix unnamed heading-anchor focus stops, adjacent inline-link spacing, outline
   scroll tracking, and the visible matrix demo rendering.
5. Verify build plus desktop/mobile navigation, scroll, focus, and overflow in a
   real browser.

## Dependencies and risks

- Existing persisted menu state must remain scoped and compatible.
- The full and lite preview profiles share the same layout components.
- The user's unrelated `demo/readme.md` edit must be preserved.

## Exit criteria

- Desktop panes remain collapsible and resizable.
- Mobile has no horizontal page overflow and both menus operate as dismissible
  drawers with 44px app-bar targets.
- Menu labels and controls are understandable without relying on filenames or
  media-control metaphors.
- Keyboard focus has no unnamed heading-link stops.
- Build and focused browser checks pass; the packet is closed atomically.
