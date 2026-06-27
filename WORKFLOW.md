# Workflow

This repository is plan-driven, with a reserved specification area for durable
requirements. Use `plans/` to manage active work and `specification/` only when
there is a lasting contract to capture.

The workflow folders are for coordination and proof. They are not runtime
storage, cache locations, or places to mirror generated app data.

## Specification Reserve

`specification/` is reserved for requirements that should constrain more than
one implementation pass. Do not create a spec just because a new plan starts.
Create one only when the maintainer asks for specification capture or when work
settles a durable rule that future changes must follow.

When a spec is needed, place it at:

```text
specification/<slug>/spec.md
```

Specifications should describe stable contracts:

- public behavior and user-visible flows;
- content, data, manifest, or schema expectations;
- routing, rendering, caching, and storage contracts;
- error, provenance, freshness, or compatibility rules;
- accepted non-goals and unsupported behavior.

Specifications should not read like plans or history. Avoid wording such as
"planned", "future", "previously", or "we decided". Put implementation history
in `implementation.md` instead.

## Plans

Use `plans/` for dated planning packets tied to active work.

Each new plan folder should use:

```text
plans/YYYY-MM-DD-<slug>/
  survey.md            # only when explicitly requested
  plan.md
  implementation.md    # created only after implementation work has happened
  test.md              # validation proof before review
```

Create `survey.md` only when the maintainer explicitly requests a survey. For
ordinary discovery, fold concise notes into `plan.md`.

Top-level `plans/open.md` and `plans/closed.md` may be used to track packet
status when there are multiple active or completed packets. Keep them concise:
packet path, status, owner or agent, and proof link.

## Plan Shape

`plan.md` should stay focused on the work package. Include the sections that
are useful for the work at hand:

- problem summary;
- goal and objectives;
- scope and non-goals;
- open points with resolution status;
- implementation phases;
- dependencies and risks;
- exit criteria.

Track unresolved questions with stable IDs such as `OP-001`. Keep the current
status visible and record a resolution only when the answer is accepted.

Once implementation starts, facts about what actually landed belong in
`implementation.md`, not in repeated rewrites of the original plan.

## Implementation Log

Create `implementation.md` only after implementation work has actually
happened. It logs facts, not intended work.

Open the file with a short **Progress** section. Use an ASCII progress marker
that is easy to update, for example:

```text
[#-----] Phase 1/6 - discovery complete; implementation next.
```

When the packet is fully implemented and proven, mark it done:

```text
[######] Done - implemented and validated; follow-ups noted below.
```

Use the rest of the file as the running trace of work:

- files changed;
- implementation facts;
- decisions made during development;
- deviations from the plan;
- follow-up risks;
- important commands or migrations.

## Test Proof

Use `test.md` as proof of behavior:

- commands run;
- fixtures or data used;
- expected results;
- actual results;
- known gaps;
- environment or dependency notes that affect reproducibility.

For planning-only changes, `test.md` may record document review and consistency
checks instead of runtime proof.

## Repository Work Areas

Use the existing project structure as the source of truth:

- `src/` contains Astro, React, and app-facing source code;
- `server/` contains server-side runtime support;
- `scripts/` contains repository automation;
- `content/` contains documentation inputs;
- `dataset/` contains collected data artifacts;
- `public/` contains static public assets.

Do not put workflow notes, plans, or specs inside runtime source folders unless
the maintainer asks for documentation to live with the code.

## Generated Data

Keep generated output and caches separate from workflow files. Do not use
`plans/` or `specification/` as scratch space for builds, fetched content,
database output, screenshots, temporary exports, or runtime caches.

When working with fetched or collected documentation, preserve the distinction
between source material and derived artifacts. Edit source material only when
the task is explicitly to change that content.

## Validation

Use the smallest meaningful verification for the change:

- `pnpm build` for app or routing changes;
- `pnpm collect` for content collection changes;
- `pnpm fetch` for fetch workflow changes when credentials and network access
  are available;
- focused script or server checks for targeted behavior;
- document consistency review for workflow-only changes.

Record what was run and what was not run in `test.md` for planned work or in
the final response for small direct changes.

## Git Ownership

The maintainer owns git history. Assistants should not run `git add`,
`git commit`, `git push`, branch-changing commands, or other history-changing
git operations unless explicitly asked. Leave completed work in the working
tree for review.
