# Responsive App-Bar Overflow Validation

## Automated Checks

- `node --test test\appbar-overflow.test.js test\layout-footer.test.js test\mobile-navigation-interactions.test.js`
  passed: 16 tests, 0 failures.
- `node --test test\menu-control-layout.test.js` passed, covering the stable
  Pages-toolbar anchor, fixed button widths, and centered TOC exception.
- `corepack pnpm build` passed after the final containment changes. Existing
  Astro route and chunk-size warnings were unchanged.
- `node scripts/check-plans.js` passed before implementation closure and was
  rerun after closing the packet.

## Browser Checks

The built SSR application was checked in Chrome using the generated root set
Home, Robotics, 3D Printing, Web, Microcontrollers, Frameworks, Protocols, and
Other.

| Viewport | Result |
| --- | --- |
| 1200px | All eight roots inline; More and Tools hidden; Pages and TOC visible; document overflow 0px. |
| 760px | Home through Web inline; four roots under More; Tools hidden; document overflow 0px. |
| 640px | Home through Web inline; four roots under More; secondary utilities under Tools; document overflow 0px. |
| 320px | Compact Home section selector; all eight roots in its panel; Tools, theme, Pages, and TOC directly reachable; document overflow 0px. |

The More panel preserved the configured hidden-root order. Escape closed the
panel and restored focus to its trigger. The Tools panel contained the
stateful graph, runtime-information, and preview-lock controls as their
existing DOM nodes.

The Pages-toolbar follow-up was checked at 160px and 200px pane widths. At
160px the trailing `All` button was clipped while the leading `1` button began
at 2.4px. At 200px `All` became fully visible and the leading button remained
at 2.4px, confirming zero horizontal drift while widening.

## Sidebar Resize Regression Follow-Up

- `node --check src\layout\menu_interactions_activation.js` passed.
- `node --test test\menu-resize-interactions.test.js test\menu-control-layout.test.js test\appbar-overflow.test.js test\mobile-navigation-interactions.test.js`
  passed: 15 tests, 0 failures.
- The focused interaction harness confirms mirrored left/right resize math,
  continuous maximum clamping at 40vw, the existing 61-159px snap band, total
  collapse at 60px, pointer-cancellation cleanup, and toggle/storage state
  synchronization.
- Source-contract checks confirm that both desktop sidebar wrappers use
  `flex-grow:0` and `flex-shrink:0`, while the 1px dividers cannot flex-shrink
  and disable text selection for the duration of an active drag.
- `git diff --check` passed.
- A fresh `corepack pnpm build` attempt could not start because the installed
  dependency layout is missing `esbuild/index.js` under Astro's pnpm package
  tree. This is an environment/dependency-resolution failure before source
  compilation; the earlier successful build evidence above remains valid for
  the app-bar implementation.
- A fresh hands-on browser pass was not claimed because the in-app preview
  surface was unavailable. The maintainer will verify the final pointer feel
  in the target preview.

## Full-Suite Environment Note

`corepack pnpm test` completed 101 tests with 87 passing, 1 skipped, and 13
failing before test execution or module import because the existing installed
dependency layout has no resolvable `glob/index.js` at the root or
`packages/content-structure/node_modules`. The focused app-bar tests passed
within that run. This dependency-installation issue is unrelated to the
app-bar source and was not changed in this packet.
