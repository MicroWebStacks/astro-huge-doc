# Diagram Toolbar Controls

## Problem Summary

Diagram blocks currently split their controls across two unrelated surfaces:
`DiagramCode.astro` renders a text-only `code/diagram` toggle, while `Panzoom`
renders a separate hover-only full-view button. The result is inconsistent
placement, weak dark-mode contrast for the full-view affordance, and no clear
control bar for diagram interactions.

## Goal

Unify the diagram actions into one compact toolbar that sits with the diagram
component, uses icons with hover titles, and preserves the existing code view
and full-view behavior.

## Scope

- Add a shared diagram toolbar for diagram, code, and full-view actions.
- Replace the text toggle with icon buttons and an active-state indicator.
- Improve full-view icon visibility in dark mode.
- Keep the existing rendered SVG, code highlighter, and modal workflow intact.

## Non-Goals

- Redesign the panzoom modal itself.
- Change diagram generation, asset lookup, or content collection behavior.
- Rework image panzoom behavior outside the shared icon-contrast fix.

## Implementation Phases

1. Refactor `Panzoom` so diagram blocks can suppress the built-in open button.
2. Add the shared toolbar and view-switch wiring in `DiagramCode.astro`.
3. Update the icon assets needed for the toolbar and dark-mode contrast.
4. Validate the touched UI with a focused Astro build.

## Exit Criteria

- Diagram, code, and full-view controls appear together in one toolbar.
- The view toggle is icon-based and exposes labels via hover titles.
- The active view is visually indicated.
- The full-view icon remains readable in dark mode.
- `astro build` passes after the change.
