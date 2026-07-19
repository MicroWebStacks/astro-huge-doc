# Menu State And Auto Test Proof

## Commands

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed.

```text
node --input-type=module
```

with `DELETE FROM html_cache`.

Result: passed. Needed so the running server emitted fresh layout markup instead
of stale cached HTML.

```text
$env:MICROWEBSTACKS_PORT='4326'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4326/
```

Result: passed.

Fresh HTML checks:

- HTTP 200;
- includes `data-state-key`;
- included the auto/manual mode control attributes used before the follow-up
  icon change;
- included the file-tree content expected before the follow-up route-only
  filter.

```text
rg -n "microwebstacks\.menuControls|setManual\(|safeWriteState|data-state-key|manual-symbol|measuring" src dist\client\_astro
```

Result: passed. Confirmed the source and built client bundle include scoped
storage, manual switching, persistence writes, state attributes, and measured
auto-fit support.

## Playwright Install Proof

```text
corepack pnpm@10.22.0 add -Dw playwright
```

Result: passed. Added `playwright ^1.61.1` to root `devDependencies` and updated
`pnpm-lock.yaml`. The first install attempt without `-w` failed with the
workspace-root guard, and the second attempt with the default pnpm major failed
with a store-version mismatch, so the final command used the repo-compatible
pnpm `10.22.0`.

## Follow-Up Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Vite reported the existing large chunk warnings.

```text
$env:MICROWEBSTACKS_PORT='4327'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4327/plans/closed
```

Result: passed with a temporary server process. Runtime HTML checks confirmed:

- desktop pages menu renders as `closed pages_menu`;
- desktop toc menu renders as `closed toc_menu`;
- the center control includes the new `mode-icon-manual` markup;
- raw source-only filenames are absent from the pages menu markup.

```text
rg -n "scrollbar-corner|mode-icon-manual|closed pages_menu|closed toc_menu" dist\client dist\server
```

Result: passed. The built CSS includes themed scrollbar corners, centered
toolbar styles, closed side-menu CSS, and the mode icon markup.

Browser-level visual automation was attempted through the in-app browser
connector, but the connector failed before attaching because the session did not
provide required sandbox metadata. Visual checks remain limited to the build,
runtime HTML, and built CSS inspection above.

## Auto/Manual Icon Follow-Up Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Vite reported the existing large chunk warnings.

```text
node --input-type=module
```

with a direct `DELETE FROM html_cache` against `dataset/content.db`.

Result: passed. Cleared the HTML cache so the preview cannot serve stale
side-menu button markup.

```text
$env:MICROWEBSTACKS_PORT='4329'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4329/plans/closed
```

Result: passed with a temporary server process. Runtime HTML checks confirmed:

- the auto/manual button renders with `data-mode="auto"`;
- the auto icon span renders with `data-mode-icon="auto"`;
- the manual icon span renders with `data-mode-icon="manual"`;
- the manual icon span no longer relies on a `hidden` attribute.

```text
rg -n "data-mode|mode-icon-manual|is-hidden" src\layout dist\client\_astro
```

Result: passed. Confirmed source and built assets contain the explicit
`data-mode` state, manual icon markup, CSS for the opposite icon, and client
logic that updates the button mode.

## Manual Depth Toggle Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Astro build succeeded with the existing large chunk warnings.

```text
rg -n 'manualDepth|toggleMode|case "auto"|data-mode="manual"|data-mode="auto"' src\layout dist\client dist\server
```

Result: passed. Confirmed the source and built client bundle now:

- persist `manualDepth` alongside mode/depth/scroll state;
- expose a dedicated `toggleMode(nav)` path for the center button;
- route the center button click through `toggleMode(nav)` instead of always
  calling `applyAuto(nav)`;
- server-render `data-mode="manual"` for the pages menu initial state.

```text
$env:MICROWEBSTACKS_PORT='4330'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4330/plans/closed
```

Result: passed with a temporary server process. Runtime HTML checks confirmed:

- the pages menu renders as `closed pages_menu`;
- the center button renders with `data-mode="manual"` on first paint;
- the auto icon starts hidden for the pages menu;
- the manual icon starts visible for the pages menu.

## Remaining Gap

- No browser automation package is installed in this repo, so actual click
  interaction was verified by built-bundle inspection plus runtime HTML checks
  rather than an automated DOM click test.

## Reveal Sync And Depth Label Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Astro build succeeded with the existing large chunk warnings.

```text
$env:MICROWEBSTACKS_PORT='4338'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4338/
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4338/specification/toc-menu-controls
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4338/_astro/SubMenu.astro_astro_type_script_index_0_lang.fOnAwU1A.js
```

Result: passed with a temporary server process. The served HTML and its current
referenced client asset confirmed:

- the home page renders two visible pages-menu depth badges and one hidden toc
  depth badge in auto mode;
- the rendered pages menu still includes `README`;
- the served `SubMenu...fOnAwU1A.js` asset contains `manualDepth`;
- the served client asset contains the `microwebstacks:nav-visibility` reveal
  event hook;
- the served client asset contains `AUTO_FIT_MARGIN = 1.2`, the delayed reveal
  sync, and the `canMeasureNav(...)` guard that avoids auto-fit on a closed
  zero-width desktop nav.

## Browser Interaction Proof

```text
$env:MICROWEBSTACKS_PORT='4345'; node server\server.js
node --input-type=module
```

Using Playwright with `chromium.launch({ channel: "msedge", headless: true })`.

Result: passed. A real browser click on the first visible pages-menu branch
produced:

- `mode: "manual"` after the click;
- `title: "Manual - custom branches; click for auto - fit height"`;
- hidden depth badge;
- exactly one expanded parent;
- persisted state containing:
  `manualKind: "custom"`, `expandedKeys: ["plans"]`, `manualDepth: 1`.

```text
$env:MICROWEBSTACKS_PORT='4351'; node server\server.js
node --input-type=module
```

Using Playwright with `chromium.launch({ channel: "msedge", headless: true })`.

Result: passed. Browser checks confirmed:

- on `/`, the active left-menu item `README` is visible after the menu opens;
- after navigating through the app-bar `docs` link, the active left-menu item
  `docs` is still visible;
- on `/`, the toc center control remains in `mode: "auto"` with the depth badge
  hidden and title `Auto - follow scroll`.

## Auto Depth And Width Transition Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Astro build succeeded with the existing large chunk warnings.

```text
node --input-type=module
```

with a direct `DELETE FROM html_cache` against `dataset/content.db`.

Result: passed. Cleared stale server-rendered HTML before the browser check.

```text
$env:MICROWEBSTACKS_PORT='4358'; node server\server.js
node --input-type=module
```

Using Playwright with `chromium.launch({ channel: "msedge", headless: true })`.

Result: passed. Real browser checks on both `/` and `/plans/closed` confirmed:

- the pages-menu center control switches to `mode: "auto"` when clicked;
- the auto-fit title is `Auto - fit height (level 2)`;
- the visible pages-menu depth is `2`;
- the depth badge shows `2`;
- the nav reports `transitionDuration: "0s"` and no inline width transition.
