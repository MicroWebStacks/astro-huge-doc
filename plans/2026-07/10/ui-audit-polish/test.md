# Test Notes

## Commands

- `corepack pnpm@10.22.0 check:plans`
- `$env:ASTRO_TELEMETRY_DISABLED='1'; corepack pnpm@10.22.0 collect`
- `$env:ASTRO_TELEMETRY_DISABLED='1'; corepack pnpm@10.22.0 build`
- Focused Playwright checks against `server/server.js` at desktop 1440x1000 and
  mobile 390x844 viewports.

## Results

- Plan index check passed.
- Collection completed with 3 documents, 33 items, and 4 assets.
- Astro server and client build passed. Existing empty ModelViewer chunk and
  large Mermaid/Cynefin bundle warnings remain non-blocking.
- Desktop proof: authored menu labels rendered; both surface headings rendered;
  depth controls read `1`, minus, `Auto`, plus, `All`; zero visible unnamed
  focusable links.
- Mobile proof: document and client widths both 390px; left and right app-bar
  targets are 44x44px; drawers are mutually exclusive; backdrop and Escape
  close correctly; focus returns to the triggering button.
- Scroll proof: bottom-of-article active outline changed to `What to look for`.
- Math proof: matrix rendered as 3 rows by 3 columns after collection.

## Visual evidence

- `.tmp/ui-audit-2026-07-10/07-improved-desktop.png`
- `.tmp/ui-audit-2026-07-10/08-improved-mobile-pages.png`
- `.tmp/ui-audit-2026-07-10/09-improved-math.png`
