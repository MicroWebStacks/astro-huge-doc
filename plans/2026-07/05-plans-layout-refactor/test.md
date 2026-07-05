# Test / Validation: Plans Layout Refactor

This packet changes workflow structure only, so validation is filesystem and
document consistency review rather than runtime app behavior.

## Commands run

```txt
Get-ChildItem plans | Select-Object Name,Mode
Get-ChildItem plans -Recurse | Select-Object FullName
rg -n "plans/YYYY-MM-DD-<slug>|plans/20[0-9]{2}-[0-9]{2}-[0-9]{2}-|plans\\20[0-9]{2}-[0-9]{2}-[0-9]{2}-" . -g '!node_modules' -g '!dist' -g '!.git'
rg -n "plans/YYYY-MM/DD-<slug>|plans/open.md|plans/closed.md|plans/README.md" AGENTS.md WORKFLOW.md plans\README.md plans\open.md plans\closed.md
git status --short
```

## Expected

- The `plans/` tree uses month buckets with day-prefixed packet folders.
- Workflow docs point at `plans/YYYY-MM/DD-<slug>/` and the new index files.
- Repo-local stale-path scans find no active flat packet references after the
  move.

## Actual

- Passed: the tree now contains `plans/2026-06/`, `plans/2026-07/`,
  `plans/archive/`, plus `plans/README.md`, `plans/open.md`, and
  `plans/closed.md`.
- Passed: `AGENTS.md` and `WORKFLOW.md` now document
  `plans/YYYY-MM/DD-<slug>/` and the top-level plan index files.
- Passed with one intentional exception: the stale-path scan only reports this
  packet's own `plan.md` problem statement, which preserves the old flat
  layout as historical context for the migration itself.
- Passed: `git status --short` shows the expected doc edits plus the packet
  file moves from the old flat paths into the new month-bucket directories.

## Known Gaps

- No runtime build/test commands were run because this change only restructures
  workflow files and path references.
