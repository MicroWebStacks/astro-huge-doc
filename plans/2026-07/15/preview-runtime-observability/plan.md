# Plan: In-Viewer Preview Runtime Observability

## Problem

Diagnosing the 2026-07-14 run-mode incident (packet
`2026-07/15-run-mode-endpoints`) required reading VS Code output channels,
process lists, and globalStorage by hand, because the browser tab carries no
evidence about which server owns it: run mode, engine version, launcher,
configured vs actual port, endpoint health are all invisible from the page.
The maintainer asked for an observation surface in the viewer itself instead
of log archaeology.

## Scope

1. `GET /__lite/runtime` (app-owned, `src/middleware.js`, same
   `extensionPreviewEnabled()` gate): engine identity (build-meta.json with
   package.json fallback), launcher identity, `dev-server`/`built` mode,
   profile/backend/output, workspace/docs/store paths, configured server
   host/port, node/pid/uptime.
2. Launcher identity as env pass-through: the VS Code extension sets
   `MICROWEBSTACKS_LAUNCHER=vscode-extension@<version>` in the engine env, so
   the viewer shows the extension↔engine pair.
3. App bar info icon (rendered only under the gate) opening a dialog that
   renders the runtime payload, live-probes `/__lite/version` and
   `/__lite/navigation` (status/content-type/latency), shows the lazy menu's
   last load result, flags configured-vs-actual port drift, and offers copy-
   as-JSON diagnostics.
4. The lazy menu's error state names the info icon instead of dead-ending.
5. Observability contract added to `specification/run-modes/spec.md`,
   including the boundary: engine-storage state (installed engine versions,
   stale activation artifacts) is launcher-side and stays out of the viewer.

## Non-goals

- VS Code "Preview status" command aggregating globalStorage engine-store
  state (natural follow-up, extension-side).
- Any transmission of the diagnostics anywhere (no-telemetry policy).

## Exit criteria

- Dialog opens from the app bar in `astro dev` and built express runs, shows
  identity + endpoint health, and flags port drift when the tab port differs
  from the configured port.
- `/__lite/runtime` answers JSON in both modes; launcher shown when set.
- Unit tests cover the payload; `pnpm test` passes.
