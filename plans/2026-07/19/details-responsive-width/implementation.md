# Implementation

## Progress

[######] Done - details now use a measured standard-column/wide-code contract.

## Changes

- `src/components/markdown/directive/DetailsDirective.astro`
  - defines a standard details width from the prose measure plus shell padding;
  - uses that width when closed or when content is wrapped;
  - accepts a measured preferred width only for open overflowing code, capped
    by the available article width;
  - makes the nested standalone code shell fill the details body;
  - keeps summary text shrinkable while the disclosure arrow stays fixed.
- `src/components/markdown/directive/details_width.js`
  - calculates preferred parent width from the standard outer width plus real
    code overflow and rejects invalid or non-overflowing measurements.
- `src/components/markdown/code/code_controls.js`
  - measures open, unwrapped standalone code after layout;
  - publishes/removes the preferred-width custom property on details toggles,
    wrap changes, line-number changes, and initialization;
  - excludes embedded diagram code and uses the widest code child when a
    details block contains more than one.
- `src/components/markdown/code/Highlighter.astro`
  - imports the controls as a processed client script so the behavior is
    included in production output, not just development source.
- `test/details-responsive-width.test.js`
  - covers the CSS contract, shrink/scroll ownership, width calculation, and
    runtime integration wiring.

## Resulting behavior

- Closed panels have the familiar standard-column width instead of an
  arbitrary content/minimum width.
- Open unwrapped panels expand only when their code has actual horizontal
  overflow and only as far as that content needs or the article permits.
- The code child consumes all space granted to the parent before showing its
  own horizontal scrollbar.
- Enabling line wrapping restores standard-column width even when the article
  has more room, avoiding a needlessly full-width details panel.
- Side-pane changes automatically alter the CSS cap without hard-coded pane or
  viewport calculations.

## Notes

The unrelated pre-existing edit in
`src/components/panzoom/lib_panzoommodal.js` was preserved.
