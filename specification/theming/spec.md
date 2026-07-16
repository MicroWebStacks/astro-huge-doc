# Specification: Light / Dark / Auto Theming

## Scope

This contract governs the site-wide color theme system: a user-selectable
**light**, **dark**, or **auto** (follow-OS) appearance, applied consistently
across every page, layout chrome, and markdown component.

It defines the token model, the persistence and resolution rules, the no-flash
load behavior, and the obligations on components and third-party surfaces.

## State Model

The theme has two distinct, separately stored notions:

- **Preference** — what the user chose: `light` | `dark` | `auto`. This is the
  source of truth, persisted in `localStorage` under the key `theme-pref`.
- **Resolved theme** — the concrete palette in effect: `light` | `dark`. When
  the preference is `light` or `dark` the resolved theme equals it; when `auto`,
  it is derived from `prefers-color-scheme`.

Both are reflected as attributes on the root `<html>` element:

| Attribute | Values | Meaning |
|-----------|--------|---------|
| `data-theme` | `light` \| `dark` | The resolved palette. All CSS keys off this. |
| `data-theme-pref` | `light` \| `dark` \| `auto` | The user preference. The toggle UI keys off this. |

CSS selects a palette **only** via `data-theme`; it never reads the preference.
The toggle UI selects its icon **only** via `data-theme-pref`.

## Resolution & No-Flash

A small inline script in the document `<head>` (before any body content) MUST:

1. Read `theme-pref` from `localStorage`, defaulting to `auto` and treating any
   unrecognized value as `auto`.
2. Resolve `auto` to `light`/`dark` via
   `matchMedia('(prefers-color-scheme: light)')`.
3. Set `data-theme` (resolved) and `data-theme-pref` (preference) on `<html>`
   before first paint.
4. On failure (e.g. storage blocked), fall back to `data-theme="dark"` /
   `data-theme-pref="auto"`.

This script runs ahead of stylesheet-driven paint so the correct palette is in
place on the first frame — there must be no flash of the opposite theme on load.

## Tokens

`src/layout/colors.css` is the **single source of truth** for color. It defines
the same set of semantic CSS custom properties twice — once under
`:root, :root[data-theme="dark"]` and once under `:root[data-theme="light"]` —
and sets `color-scheme` (`dark`/`light`) in each block so native scrollbars and
form controls match.

Rules:

- Tokens are **semantic**, named by role (e.g. `--content-bg-color`,
  `--note-accent-color`, `--code-border-color`), not by literal color.
- Components MUST reference tokens via `var(--token)` and MUST NOT hardcode hex,
  `rgb()`, or named colors in their styles.
- The default (no `data-theme`, e.g. JS disabled) resolves to the **dark**
  palette, preserving the site's historical look.
- Adding a token requires defining it in **both** palettes.

### "Always-light" surfaces

Some content is authored for a light backdrop (kroki SVG diagrams with dark ink,
3D model posters, the image lightbox). These keep a light surface in light mode,
but in dark mode they are **dimmed to a soft grey** rather than pure white, to
avoid a glare/flash. They use dedicated tokens
(`--diagram-surface-bg`, `--model-viewer-bg`, `--lightbox-*`) and must never be
left as literal `#fff` in a component.

### Diagram text contrast

PlantUML diagrams are re-rendered per resolved theme with an injected
`skinparam` header (`src/libs/plantuml-theme.js`, shared by the client engine
and the Kroki path; its colors mirror `colors.css` because the render engines
cannot read CSS variables). The header themes element boxes to the palette's
panel color, which creates a contrast obligation:

- **Text drawn on the page background** (titles, arrow labels, the default
  font) uses the theme's fixed ink color.
- **Text drawn inside an element box** (participants, rectangles, classes and
  their members, notes, and every other themed element) MUST use PlantUML's
  `FontColor automatic`, which resolves to black or white against the box the
  text actually sits on — **never** the fixed theme ink.

The rule exists because authors may color elements explicitly (e.g.
`rectangle Foo #LightBlue`, `note ... #LightYellow`): a fixed light ink on
such a box is unreadable in dark mode, and a fixed dark ink has the mirror
problem in light mode. With `automatic`, themed panels keep the expected
palette ink while author-colored boxes stay readable in both themes, without
parsing or rewriting the author's source.

`test/plantuml-theme.test.js` guards this split: every element-level
`*FontColor` in the generated header must be `automatic`, and the page-level
ones must not be.

Mermaid handles the same concern internally: the client renderer passes the
resolved theme to mermaid's own `dark`/`default` theme, which computes its
node text colors together with node backgrounds.

## Toggle Control

A single toggle (`ThemeToggle.astro`, mounted in the AppBar) cycles the
preference in the fixed order **light → dark → auto**, then wraps. On each
activation it:

1. Computes the next preference, persists it to `localStorage`, and updates both
   `<html>` attributes (resolving `auto` against the OS at that moment).
2. Shows exactly one icon matching the current preference: sun (light), moon
   (dark), monitor (auto).

While the preference is `auto`, a `matchMedia` change listener re-resolves and
re-applies the theme live, without a reload. The listener must be a no-op when
the preference is not `auto`.

## Dynamic Consumers

Surfaces that cannot be styled by static CSS tokens must observe the resolved
theme at runtime and react to changes:

- **Code highlighting** (Shiki) emits *both* palettes as inline CSS variables
  (`--shiki-light` / `--shiki-dark` / `*-bg`) via dual-theme output; the active
  one is chosen in CSS by `data-theme`. Code blocks must re-theme on toggle with
  no re-render.
- **JS that reads color tokens** (e.g. resize-handle coloring) MUST read the
  custom property live at use-time, not cache it at load, so it follows toggles.
- **Embedded React/Mantine tables** mirror `data-theme` into their own
  `colorScheme` and update via a `MutationObserver` on the `data-theme`
  attribute.

## Non-Goals

- No per-component or per-page theme overrides; theme is global.
- No server-side persistence of the preference (client `localStorage` only).
- No additional named themes beyond light/dark (auto is a resolution mode, not a
  third palette).
- Theming does not attempt to recolor raster content (screenshots, photos) or
  transparent PNGs authored for a specific background.
