# Test: UI design-system consolidation

## Result

- `pnpm build` succeeds (client + server + prerender), twice — once after the
  token/spacing/radius/shadow/focus/motion sweep, once more after removing
  the now-dead `--button-shadow-color` token.
- Verified in the built CSS output: the `prefers-reduced-motion` guard and
  `--shadow-raised` both landed in `dist/client/_astro/*.css`.
- Visual check via a Playwright-driven `astro dev` session (screenshots in
  light + dark, `data-theme` toggled through `localStorage`):
  - Demo homepage: nav bar, side-menu toggle icons, heading with accent bar,
    inline-code chips, and the Mermaid diagram toolbar (copy / view-mode /
    line-numbers / wrap / expand buttons) all render correctly in both
    themes — no layout breakage from the spacing/radius/type-scale swaps.
  - Tab-focus on a body link and on the diagram toolbar's copy button both
    show a clean, visible `--front-blue` outline. The copy button's ring in
    particular confirms the `outline-offset: -2px` fix works — without it,
    the `.toolbar-group`'s `overflow: hidden` would have clipped an outset
    ring on the first/last button in the group.
  - Theme switch confirmed programmatically: `body` computed background is
    `rgb(30, 30, 30)` (`#1E1E1E`) under `data-theme="dark"` and
    `rgb(255, 255, 255)` under `data-theme="light"`.

## Known gaps

- The demo content set (`demo/`, `content/demo/`) doesn't currently exercise
  the `NotesDirective`, `DetailsDirective`, `Cards`/`CardsMeta`, or
  `ButtonDirective` components, so those token swaps (padding, radius,
  `--shadow-raised` on Cards/ButtonDirective, the `summary`/link focus rings)
  were verified by reading the built CSS and the component source, not by
  screenshotting them rendered. Worth a manual check next time content using
  those directives is available, or by adding a demo page that exercises
  them.
- No `astro preview` (production SSR) visual check — the preview server
  404'd on an existing, correctly-hashed `_astro/*.css` file across three
  clean restarts, seemingly unrelated to this change (`astro dev` served the
  same build fine). Worth a `/run-skill-generator` pass or a separate bug
  report if it recurs; not blocking here since `astro dev` exercises the
  same component code and CSS.
- No automated visual regression tooling in this repo, so the "Med
  confidence" spacing/rhythm risk the plan called out is only spot-checked,
  not exhaustively diffed against the pre-change layout.
