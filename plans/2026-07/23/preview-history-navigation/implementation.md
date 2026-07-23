# Preview History Navigation — Implementation

## Progress

[####] Done - rendered-route history, breadcrumb controls, webview relay, and
focused/runtime validation are complete.

## Changes

- Added per-workspace `historyRoutes` and `historyIndex` state to the VS Code
  preview session. Editor-follow routes and routes loaded through rendered
  links share one history, while a new route after Back truncates the old
  forward branch.
- Added a narrowly typed, origin-checked relay in the outer webview wrapper.
  Rendered pages can report their pathname and request Back/Forward; the relay
  accepts no arbitrary commands or payloads.
- Added extension-preview-only Back and Forward buttons on the breadcrumb
  band's right edge. Availability is sent back to the rendered page so each
  button is disabled at its corresponding history boundary.
- Added the breadcrumb/history row to the Home route in extension mode. Full
  site mode keeps its previous root-page layout, and link-preview thumbnails
  continue hiding page chrome.
- Added pure history-state tests, a small client-interaction fixture, markup
  assertions, and extension-host Back/Forward coverage.

## Validation

- `node --test test/preview-history-navigation.test.js test/vscode-extension-manifest.test.js`
  passed: 8/8 tests.
- `corepack.cmd pnpm test:extension` passed under VS Code 1.100.3:
  4/4 cases, 0 failures, 0 timeouts.
- `corepack.cmd pnpm build` passed. Existing dynamic-route, empty-chunk, and
  large-chunk warnings remain non-fatal.
- `corepack.cmd pnpm check:plans` passed after packet closure.

## Notes

- The first sandboxed build/test attempts could not read Astro's user config
  or the `@vscode/test-electron` package. The same commands passed outside the
  workspace sandbox; these were environment permission failures, not product
  failures.

## Runtime correction — 2026-07-23

- User runtime evidence showed the controls remained disabled. VS Code's
  localhost port mapping can rewrite the framed page's effective origin, but
  the relay required an exact `http://localhost:<port>` origin. The relay now
  authenticates messages by the iframe's `WindowProxy` identity and permits
  the mapped origin in both directions.
- Extracted the wrapper renderer into a testable module and executed its
  generated relay script against a simulated port-mapped origin. The test
  verifies initial state delivery, iframe-to-extension actions, and
  extension-to-iframe availability updates.
- Replaced the small text arrows with 20px stroked SVG arrows and a 32px
  control footprint matching VS Code's prominent Back/Forward treatment.
