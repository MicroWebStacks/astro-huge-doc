# Specification: Responsive App Bar

## Scope

This contract governs the global app bar rendered by `AppBar.astro` in the
full, static, and lite/extension profiles. It applies when the root
documentation structure produces any number of top-level section links.

The app bar is stable application chrome. The number and length of root
section labels must not determine the minimum width of the page.

## Layout Invariants

At every supported viewport width and browser zoom level:

- the app bar occupies one row and does not wrap;
- the app bar must not create document-level horizontal overflow;
- the Pages control and, when available, the On this page control remain
  directly reachable;
- the active root section remains visible or is represented by the compact
  section selector;
- controls at the right edge cannot be displaced off-screen by generated
  section links;
- every hidden section and tool remains reachable without pointer hover.

The full pages tree remains the authoritative scalable navigation surface.
App-bar section links are quick access to that structure, not a promise that
every root folder is simultaneously visible.

## Responsive States

The app bar has three behavioral states.

### Full

When all root sections fit between the leading Pages control and the utility
group, every section is shown inline and the section-overflow trigger is
hidden.

### Priority Overflow

When all root sections do not fit:

- the active section is retained inline;
- Home is retained when the remaining width permits it;
- other sections are retained in their configured order while they fit;
- the remaining sections move into a labeled `More` disclosure;
- the utility group retains its width and position.

The transition is based on the app bar's measured container space and rendered
item widths, not solely on a fixed viewport breakpoint. Resizing, zooming,
font loading, label changes, and profile-specific controls must trigger a new
fit calculation.

### Compact

When there is not enough section space for both the active item and the
overflow trigger, all inline section links move into the disclosure and its
label becomes the active section name. If no active section is available, the
label is `Sections`.

At the shell's existing mobile breakpoint, secondary utility controls
consolidate under a labeled `Tools` disclosure. Pages, the compact section
selector, theme, and On this page remain outside that disclosure.

## Width Allocation

The section navigation receives the remaining inline space after subtracting:

- the leading Pages control;
- the protected utility group;
- app-bar padding and gaps.

Within that section space, the fit calculation reserves the width of the
section-overflow trigger whenever one or more sections are hidden. The
algorithm uses the actual rendered outer widths of links and controls.

The app bar and its flex/grid descendants must use shrinking and clipping
boundaries that prevent intrinsic link widths from widening the page while the
fit calculation runs.

## Disclosure Behavior

Section and tool overflow controls are disclosure buttons, not hover menus.

They must:

- expose their state with `aria-expanded`;
- reference their disclosure panel with `aria-controls`;
- open with pointer activation, Enter, or Space through native button
  behavior;
- close on Escape and return focus to the trigger;
- close when focus or pointer activation moves outside the disclosure;
- retain visible focus treatment;
- show full reader-facing labels inside the disclosure;
- preserve the configured section order;
- identify the current section with `aria-current="page"`.

The section trigger uses the visible word `More` in priority-overflow state
because it contains navigation destinations. An unlabeled ellipsis is reserved
for action overflow and must not replace that label.

## Large Root Sets

All hidden roots remain available in the section disclosure. The disclosure
may scroll within a viewport-bounded panel, but it must not widen the document.
The structure must permit a future searchable `Browse all sections` surface
without changing the app-bar width contract.

## Accessibility And Resilience

- App-bar links and controls retain the project's existing minimum target
  sizing and visible focus styles.
- No essential behavior depends on hover.
- Disclosure panels remain within the viewport and have a bounded block size.
- The compact state must continue to work at widths equivalent to a 320 CSS
  pixel reflow viewport.
- If client-side fitting has not run yet, clipping boundaries may temporarily
  hide excess inline links, but they must still prevent page-level horizontal
  overflow. Once scripts initialize, every clipped destination is exposed
  through the disclosure.

## Non-Goals

- The app bar does not attempt to display an unlimited number of root links at
  once.
- Root section labels are not reduced to unexplained icons.
- The app bar does not become a horizontally scrolling carousel.
- Natural multi-row wrapping is not a responsive fallback.
- This contract does not change the contents, ordering, or persistence rules
  of the Pages or On this page side navigation.
