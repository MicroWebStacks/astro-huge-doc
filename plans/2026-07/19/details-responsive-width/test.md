# Validation

## Focused width/scroll contract

Command:

```text
node --test test/details-responsive-width.test.js
```

Result: 4 passed, 0 failed.

Coverage includes standard-column CSS, open measured growth, nested code width,
scroll ownership, preferred-width arithmetic, wrap/open state wiring, and the
processed production script import.

## Full suite

Command:

```text
node --test "test/**/*.test.js"
```

Result: 36 passed, 0 failed.

## Production build

Command equivalent to `pnpm build`:

```text
node node_modules/astro/astro.js build
```

Result: pass. The SSR and client bundles completed successfully; existing
dynamic-route and bundle-size warnings remained non-fatal.

## Built-route verification

Started the freshly built SSR server on isolated port 4325 and requested the
details fixture at `http://127.0.0.1:4325/other/sound`.

- HTTP status: 200.
- Emitted CSS contains the standard-width, measured-open-width, hard-cap, and
  nested-code-fill rules.
- Delivered HTML contains the code-controls initialization, wrap-state logic,
  measured-width property, and wide-code state logic.
- The isolated process was stopped after the checks; the user's existing
  development server was not touched.

## Visual-test limitation

The in-app browser surface was unavailable in this session, so a live pixel
comparison across side-pane states could not be captured. The supplied
screenshots drove the corrected state model, while focused behavioral tests,
the full suite, production build, and emitted-asset checks provide automated
regression coverage.
