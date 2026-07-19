# Agent Guidance

## Workflow Sources

Use `WORKFLOW.md` as the repository workflow contract. Keep this file short:
it is the quick-start guidance for assistants working in this repo.

## Spec And Planning Workflow

This repository reserves `specification/` for stable requirements and uses
`plans/` for time-bounded planning packets.

- Do not start specification capture unless the maintainer explicitly asks for
  it or a durable implementation contract has clearly emerged.
- Store durable specifications under `specification/<slug>/spec.md` when a
  requirement must outlive one implementation pass.
- Store planning work under `plans/YYYY-MM/DD/<slug>/`. Use the ISO month and
  day as date buckets, then a short lowercase slug for the packet directory.
- New dated plan folders should always contain `plan.md`.
- Create `implementation.md` only after implementation work has actually
  happened. Do not create it upfront as a planning stub.
- Add `test.md` only when validation notes are useful to preserve; it is never
  required to close the plan.
- Add `survey.md` only when the maintainer explicitly asks for a survey.
- Keep `plans/README.md` as the concise layout note, `plans/open.md` for work
  still outstanding, and `plans/closed.md` for implementation-finished or
  planning-only settled packets.
- Keep `plan.md` focused on scope, milestones, dependencies, risks, and exit
  criteria. Do not turn unreviewed discovery notes into committed scope.
- Keep `implementation.md` as a running log of changes made, decisions,
  deviations from the plan, and follow-up risks.
- Keep `test.md` as optional validation evidence: commands run, fixtures used,
  expected and actual results, and any gaps that remain untested.
- Close the plan as soon as implementation is finished. Testing can happen
  before or after closure and does not change the plan's definition of done.
- Treat "write `[######] Done` in implementation.md" and "move the packet's
  row from `plans/open.md` to `plans/closed.md`" as one atomic step, not two.
  Do the index edit in the same turn you write the Done marker — never as a
  separate follow-up the maintainer has to ask for.
- The Progress marker in `implementation.md` must be its own line starting
  with `[` (e.g. `[####] Done - ...` or `[##----] Phase 2/6 - ...`), not
  embedded mid-sentence — `pnpm check:plans` parses it literally and a
  reformatted marker will read as missing.
- Run `pnpm check:plans` after any plan-index edit (new packet, phase update,
  or closure). It cross-checks every packet's `implementation.md` Progress
  marker against `open.md`/`closed.md` and fails loudly on drift — treat a
  failure as something to fix immediately, not defer.

When a plan changes during implementation, update the dated plan folder and the
top-level plan indexes so the packet, implementation notes, optional test
notes, and repo-level status stay consistent.

Plan review and the plan-to-implementation trigger are exclusively maintainer-
initiated actions — never solicit approval via `ExitPlanMode` or chat questions.

## Temporary Files

- Never create temporary files, scratch scripts, or captured logs in the
  workspace root. This includes any `*.tmp`, `.tmp_*`, `*.log`, ad-hoc
  `*.mjs`/`*.js` probe scripts, server output dumps, or one-off HTML/profile
  dumps.
- Put all such throwaway artifacts inside the `.tmp/` folder, which is already
  gitignored. Create subfolders under `.tmp/` to group a session's artifacts
  (for example `.tmp/menu-state-smoke/`).
- Do not invent root-level escape hatches such as a `.tmp_` prefix; only the
  `.tmp/` directory is sanctioned and ignored.
- Clean up after a task when practical; the `.tmp/` folder is disposable and
  must never hold anything the repo depends on.

## Repo Practices

- When writing or generating Mermaid/PlantUML diagram source (fenced blocks,
  `.puml`/`.mmd` files), always quote node/participant identifiers that
  contain spaces, hyphens, or other special characters (e.g.
  `participant "On-Call" as OnCall`) — unquoted special characters are a
  recurring cause of diagram parse failures.
- Respect existing Astro, React, Node, and script patterns before introducing
  new abstractions.
- Treat fetched or collected documentation inputs as source material. Avoid
  editing generated or imported content unless the task is specifically about
  that content.
- Keep generated runtime data, build output, and cache artifacts out of
  workflow folders.
- Run the smallest meaningful verification for the change. Common checks are
  `pnpm build`, focused script runs such as `pnpm collect`, or document review
  for planning-only updates.
- Leave git history operations to the maintainer unless explicitly asked.
