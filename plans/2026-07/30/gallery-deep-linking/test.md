# Gallery Image Deep Linking Validation

## Passed checks

- `node --check src\components\gallery\gallery.js`
- `node --check src\libs\gallery-deep-link.js`
- `node --check src\layout\link_preview.js`
- `node --test test\gallery-deep-link.test.js`
  - Result: 5 tests passed, 0 failed.
  - Covered exact UID round trips including `#` and spaces, preservation of
    unrelated query/fragment state, removal of the internal preview hash,
    stable gallery markup, direct `loadAndOpen` wiring, preview suppression,
    and same-origin/current-iframe message validation.
- `git diff --check`
- `node scripts\check-plans.js` before implementation closure.

## Broader checks and environment gaps

- `node --test "test/**/*.test.js"`
  - Result: 124 tests discovered; 106 passed, 17 failed, 1 skipped.
  - The new five gallery deep-link tests passed in the full run.
  - All 17 failures occur during module import or a live-backend fallback
    because the installed dependency layout cannot resolve `glob/index.js`
    from the root or `packages/content-structure/node_modules`.
- `node node_modules\astro\astro.js build`
  - Could not reach source compilation because Astro's installed pnpm package
    tree cannot resolve `esbuild/index.js`.
- `pnpm check:plans`
  - `pnpm` is not available on this shell's PATH. The underlying repository
    check was run directly with `node scripts\check-plans.js`.
- No built browser/VS Code Extension Development Host interaction is claimed
  while the build cannot start. The focused checks verify the URL and message
  contracts; a repaired dependency install should be followed by a click
  through of full-page open/change/close, direct URL load, and preview handoff.
