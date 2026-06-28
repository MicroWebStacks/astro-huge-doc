# File Tree Menu Plan

## Problem

The pages menu is built from renderable `documents` rows. That loses source-tree
folders that do not have their own Markdown document and makes repeated
basenames such as `plan.md` or `implementation.md` appear as unrelated flat
items.

## Goal

Build the pages menu from a first-class source tree index while keeping
`documents` focused on renderable pages.

## Scope

- Add a repo-local source tree table to `dataset/content.db` during collection.
- Index folders and files under the configured content root.
- Attach document routes to indexed entries when a source file is renderable.
- Build the app bar and pages sidebar from rendered document routes plus their
  source-tree folder ancestors.
- Use source-style labels in the pages tree: Markdown files display their
  filename without the `.md` suffix, including `README`.
- Preserve existing document rendering and URL routing.

## Non-Goals

- Do not change the linked `content-structure` package outside this repository.
- Do not add raw source-file preview for non-Markdown files in this pass.
- Do not redesign the sidebar visual treatment beyond what is needed for a
  correct tree.

## Implementation Phases

1. Add source tree indexing after `content-structure.collect()` completes.
2. Replace pages-menu tree construction with source-tree driven construction.
3. Keep app-bar section behavior compatible with current top-level sections.
4. Validate with the current `content/` fixture and build output.

## Risks

- The app must tolerate older databases that do not yet have the new table.
- Non-renderable files must stay out of the visible website navigation.
- Directory README routes should link from the directory node instead of adding a
  duplicate `README.md` child.

## Exit Criteria

- `pnpm collect` creates source tree rows for folders and files.
- The menu shows rendered Markdown pages and required folders only.
- Raw non-rendered source files such as YAML, Python, SQL, lock files, and
  extensionless files do not appear.
- Dated plan folders appear as parents containing `plan` and `implementation`.
- `pnpm build` succeeds.
