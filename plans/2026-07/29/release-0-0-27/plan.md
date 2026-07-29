# Release Engine 0.0.23 and Extension 0.0.27

## Goal

Prepare and package a coordinated release containing the current worktree:

- engine 0.0.23 with Markdown list/inline-fragment preservation and
  percent-bearing workspace path fixes;
- extension 0.0.27 with bundled-only engine acquisition and startup timings.

## Scope

- Align both changelogs and version pins.
- Include the existing runtime, renderer, extension, tests, workflow notes,
  and lockfile correction in the release source commit.
- Run the full test suite and plan checks.
- Package and verify an upload-ready VSIX from the committed source state.
- Push the resulting release commits.

## Non-goals

- Do not publish the npm engine package.
- Do not upload the VSIX to the Marketplace.
- Do not change GitHub Pages or reusable Action behavior.

## Phases

1. Finalize versions, changelogs, and release scope.
2. Validate and commit the exact source state.
3. Package the VSIX, record evidence, close the packet, and push.

## Exit Criteria

- Engine and extension versions are unique and changelogs are aligned.
- The full test suite passes.
- The VSIX contains the authenticated bundled engine 0.0.23 and extension
  0.0.27 metadata.
- Release commits are pushed and the artifact path is reported.

