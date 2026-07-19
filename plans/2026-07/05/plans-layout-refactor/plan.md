# Plan: Plans Layout Refactor

## Problem Summary

This repository still stores planning packets under the flat
`plans/YYYY-MM-DD-<slug>/` layout. The workflow being adopted from
`C:\dev\VectorMind\evidence-engine\WORKFLOW.md` uses month buckets:

```text
plans/YYYY-MM/
  DD/
    <slug>/
```

The repo also lacks the packet index surfaces that workflow expects
(`plans/open.md`, `plans/closed.md`, and a concise `plans/README.md`), and
existing cross references still point at the flat paths.

## Goal

Refactor `plans/` to the month-bucket layout, adopt the reusable packet
workflow from `evidence-engine` without carrying over repo-specific business
logic, and update repo references so packet links stay valid.

## Scope

- Move existing plan packets into `plans/YYYY-MM/DD/<slug>/`.
- Update `WORKFLOW.md` and `AGENTS.md` to document the new packet layout and
  top-level packet indexes.
- Add `plans/README.md`, `plans/open.md`, and `plans/closed.md`.
- Rewrite repo-local references that still use the flat packet paths.

## Non-Goals

- No changes to runtime app behavior.
- No changes to durable feature specifications beyond path/reference cleanup.
- No attempt to import unrelated `evidence-engine` repository rules.

## Open Points

- OP-001 - Packet index status classification.
  Status: resolved during implementation by reading the existing packet files
  and classifying only clearly in-progress packets as open.

## Milestones

1. Audit the current packet tree and reference surfaces.
2. Move packets into month buckets and add plan indexes.
3. Update workflow docs and cross references.
4. Validate that no active repo references still point at the old flat layout.

## Risks

- Some packet-local notes and proof commands reference old paths and would
  become misleading after the move if not updated.
- Open/closed classification can drift from reality if the indexes are filled
  by assumption instead of packet inspection.

## Exit Criteria

- All existing packets live under `plans/YYYY-MM/DD/<slug>/`.
- Workflow docs and plan index docs describe the month-bucket layout.
- Repo-local references to moved packet paths are updated.
- A targeted stale-reference scan shows no active flat packet paths outside
  intentional historical wording for the migration itself.
