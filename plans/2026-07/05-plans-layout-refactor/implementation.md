# Implementation: Plans Layout Refactor

## Progress

[######] Done - plans tree migrated, workflow docs updated, and stale packet
path references rewritten.

## Changes

- Moved every dated packet from the flat `plans/YYYY-MM-DD-<slug>/` layout into
  month buckets under `plans/YYYY-MM/DD-<slug>/`.
- Updated `WORKFLOW.md` and `AGENTS.md` to adopt the month-bucket packet
  layout and to require the top-level plan index surfaces.
- Added `plans/README.md`, `plans/open.md`, and `plans/closed.md`.
- Classified only clearly active packets as open:
  `2026-06/27-ui-redesign`, `2026-06/28-vscode-marketplace-readiness`, and
  `2026-07/04-features-alignment`.
- Rewrote repo-local references to moved packet paths, including packet-local
  proof commands and cross-packet links in docs/spec comments.

## Notes

- `plans/archive/` was left in place.
- The only remaining flat-layout text is the historical problem statement in
  this packet's own `plan.md`, kept intentionally to describe what changed.
