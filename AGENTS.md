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
- Store planning work under `plans/YYYY-MM-DD-<slug>/`. Use the ISO date for
  the day the plan packet starts, followed by a short lowercase slug.
- New dated plan folders should contain `plan.md` and a validation record in
  `test.md` before the work is considered ready for review.
- Create `implementation.md` only after implementation work has actually
  happened. Do not create it upfront as a planning stub.
- Add `survey.md` only when the maintainer explicitly asks for a survey.
- Keep `plan.md` focused on scope, milestones, dependencies, risks, and exit
  criteria. Do not turn unreviewed discovery notes into committed scope.
- Keep `implementation.md` as a running log of changes made, decisions,
  deviations from the plan, and follow-up risks.
- Keep `test.md` as proof of working behavior: commands run, fixtures used,
  expected and actual results, and any gaps that remain untested.

When a plan changes during implementation, update the dated plan folder so the
plan, implementation notes, and test proof stay consistent.

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
