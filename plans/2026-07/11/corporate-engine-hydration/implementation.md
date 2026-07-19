# Implementation

## Progress

[######] Done - dependency restoration no longer renames `_modules`, and activation failures emit automatic local diagnostics.

## Changes

- `packages/vscode-extension/extension.js`
  - reads `vendoredModulesDir` from the authenticated package metadata;
  - maps that tar subtree directly to `node_modules` during extraction;
  - removes the post-extraction `_modules` directory rename;
  - records the extraction/validation/promotion stage;
  - on activation failure, runs non-networked storage probes and prints named
    PASS/FAIL results without absolute paths;
  - preserves bounded retries for replacing and transactionally promoting the
    complete engine directory.
- `scripts/diagnose-extension-hydration.cjs` provides a Node 22-compatible,
  VS Code-independent check for corporate administrators.
- `package.json` exposes the check as `diagnose:extension-hydration` while the
  documented direct `node` command works without pnpm.
- `packages/vscode-extension/README.md` documents automatic and standalone
  diagnostics.

## Decisions

- The archive continues using `_modules` because npm packaging strips real
  `node_modules`; only extraction maps the name.
- Diagnostics do not contact a service, upload telemetry, or print the user's
  global-storage path.
- The final temp-root-to-versioned-root rename remains because it provides the
  transactional activation boundary; unlike the removed dependency rename,
  it already has bounded `EPERM`/`EBUSY` retries.
