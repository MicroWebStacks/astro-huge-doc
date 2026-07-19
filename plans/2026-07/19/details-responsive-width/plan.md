# Responsive details width

## Problem

The details shell and its code child were using competing intrinsic-width and
minimum-width rules. The result varied by state: a closed details panel had an
arbitrary narrow width, an open panel could fill the article unnecessarily,
and a code block could remain narrow even while its parent had unused space.

## Goal

Use one state-aware width contract:

- closed details and details containing wrapped code use the standard content
  column width;
- open details containing unwrapped overflowing code grow only by the measured
  horizontal overflow;
- growth is capped by the currently available article width, so opening and
  closing side panes is handled by layout rather than fixed viewport math;
- the nested code shell fills the details body and owns any remaining
  horizontal scroll.

## Scope

- Revise details shell, summary, body, and nested-code sizing.
- Publish the preferred open width from the existing code-controls module.
- Preserve standalone code, embedded diagram code, and the wrap toggle.
- Add regression checks for calculation, state wiring, CSS ownership, and the
  production bundle.

## Non-goals

- Changing the existing prose measure.
- Changing diagram natural-width publication.
- Changing side-menu sizing or persistence.
- Removing code's horizontal scrollbar when unwrapped content still exceeds
  the available article width.

## Exit criteria

- Closed and wrapped details use the standard column width, capped at 100%.
- Open unwrapped details grow to measured need but no wider than the article.
- Nested standalone code uses all width provided by its details parent.
- Wrapping immediately returns the parent to standard width.
- Focused tests, the full suite, production build, and built-route asset checks
  pass.
