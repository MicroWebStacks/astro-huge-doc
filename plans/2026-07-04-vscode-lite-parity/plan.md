# Plan: VS Code Lite Parity

## Problem Summary

The installed VS Code preview diverges from the local website in two visible
ways:

- the left pages menu loses the newer folder-aware file tree and falls back to
  a document-only tree;
- the diagram toolbar renders hover hitboxes but not the SVG icons.

## Goal

Restore parity for the VS Code lite runtime where practical without changing
the extension's current `DOCS_PROFILE=lite` / `DOCS_BACKEND=json` design.

## Scope

- Preserve the file-tree contract in the lite JSON dataset.
- Keep the pages menu source-tree driven when `source_entries` are available.
- Ship the toolbar SVG assets in the staged engine package used by the
  extension.
- Document proof and deployment steps for the updated local VSIX flow.

## Non-Goals

- Do not redesign the extension away from the lite/json runtime in this pass.
- Do not change the app-bar contract or the TOC menu behavior.
- Do not publish the engine or extension to external registries/marketplaces in
  this pass.

## Implementation Phases

1. Add a durable file-tree spec for the pages menu contract.
2. Make JSON collect/export include `source_entries`.
3. Make the JSON backend expose those entries to the existing layout code.
4. Include `src/assets` in staged engine packaging so `SvgIcons` resolves in
   installed-engine runtime.
5. Run focused validation and record deploy steps.

## Risks

- JSON collect must stay free of unconditional native SQLite imports.
- The staged engine fix must preserve the existing lite packaging boundary.
- Older JSON datasets without `source_entries` still need to degrade cleanly.

## Exit Criteria

- A lite JSON dataset contains `source_entries`.
- The JSON backend no longer returns an empty source-tree menu when the dataset
  carries those entries.
- The staged engine includes the SVG assets required by `SvgIcons`.
- Focused validation passes and deploy steps are documented.
