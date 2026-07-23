# Mobile Drawer Navigation — Implementation

## Progress

[###] Done - link activation closes mobile drawers and preserves that state
across destination-page loads.

## Changes

- `src/layout/menu_interactions_activation.js` now delegates link clicks from
  both mobile navigation elements to the shared close routine. Delegation also
  covers links inserted by lazy navigation.
- The close routine stores `false` under each mobile toggle's existing scoped
  storage key, preventing the destination page from restoring an open drawer.
- `test/mobile-navigation-interactions.test.js` exercises opening the Pages
  drawer, activating a delegated link, and verifying its visual, ARIA, body,
  and persisted state.
- `specification/toc-menu-controls/spec.md` records link activation as a mobile
  drawer dismissal contract.

## Validation

- `node --check src/layout/menu_interactions_activation.js` passed.
- `node --test test/mobile-navigation-interactions.test.js` passed.
- `corepack pnpm check:plans` passed with all 34 packets consistent.
- `corepack pnpm build` passed after restoring the checkout's incomplete
  dependency links. Inspection of the generated server manifest confirms the
  delegated `a[href]` handler and persisted mobile-close state are present in
  the extension-consumed `dist` output.
