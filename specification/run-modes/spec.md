# Specification: Run Modes, In-App Endpoints, Environment, and Ports

## Scope

This contract defines every way the engine can be run, who owns each HTTP
surface in each mode, how environment variables select behavior, and how
ports are chosen. It exists to prevent a recurring bug class: a feature that
works in one run mode and silently breaks in another because its parts are
owned by different layers.

Profile/backend/output combinations are governed by
`specification/engine-profiles/spec.md`; this spec is about the *processes*
that serve those combinations.

## Motivating incident (2026-07-14)

Running the demo with `pnpm dev` showed "Pages could not be loaded." in the
side menu. Four independent design gaps had to align for one small failure,
which is why it took a full investigation to diagnose — and why each gap now
has its own invariant below:

1. **Split endpoint ownership.** `Layout.astro` emitted the lazy-navigation
   client (which fetches `/__lite/navigation`) whenever
   `MICROWEBSTACKS_EXTENSION_MODE=true`, but the endpoint was registered only
   in the express wrapper (`server/server.js`). Under `astro dev` there is no
   express wrapper, so the fetch had nothing to hit. → Invariant 1.
2. **Duplicated, diverging gates.** The client side gated on the env var
   alone; the server side gated on the env var *and* `dataBackend === 'json'`.
   Even under express, a sqlite run with extension mode on would have shipped
   the UI without the endpoint. → Invariant 2.
3. **Dishonest responses.** The catch-all page answered the unknown
   `/__lite/navigation` URL with the not-found page as `200 text/html`, so
   `response.ok` lied and the JSON parse threw a generic error. → Invariant 3.
4. **Port drift hid which server was answering.** The `.env` port 4321 was
   taken, `astro dev` silently auto-incremented to 4323, and the browser tab
   gave no hint that this origin was a bare `astro dev` rather than the
   extension-style server the page assumed. → Port strategy below.

## Run mode inventory

A run mode is a way of putting the rendered app behind an HTTP listener.
These are the supported modes; anything else carries no promise.

| Mode | Command / launcher | HTTP layer | Astro app present at request time | Role |
| --- | --- | --- | --- | --- |
| Dev server | `pnpm dev` / `pnpm start` (`astro dev`) | Astro dev server | yes (with HMR) | Engine development; must faithfully exercise every request-time feature |
| Express SSR | `pnpm server` (`server/server.js`) | express wrapping the built SSR handler | yes (built `dist/server/entry.mjs`) | Self-hosted website; also the process the VS Code extension launches |
| Extension preview | VS Code extension → staged engine's `server/server.js` | same as Express SSR | yes | Live preview of a markdown workspace (lite/json) |
| Static hosting | `astro build` with `astro.config.static.mjs`, any file server | none of ours | no (prerendered HTML only) | GitHub Pages et al. |

Notes:

- Express SSR and the extension preview are the *same run mode* with
  different launch environments. The extension is not a special server.
- `astro preview` is not a supported mode for the server output (the Node
  adapter runs in middleware mode); use `pnpm server` to exercise a build.

## Invariant 1 — endpoints a page fetches live in the app, never in a wrapper

Any URL that rendered pages request at runtime (`fetch`, `<script src>`,
`<img>`, polling) must be answered by the Astro app itself — middleware in
`src/middleware.js` or a route under `src/pages/` — so it exists in **every**
run mode that renders pages, `astro dev` included.

The express wrapper may only own concerns that cannot exist inside the app:
process-level auth, TLS termination, serving the built client assets, and the
HTML cache. The wrapper must never define a URL that a page depends on. When
a wrapper route would shadow an app route, the app route wins by deletion of
the wrapper route — two implementations of one URL is the bug from the
incident waiting to reoccur.

Current app-owned request-time endpoints:

- `/blobs/<name>` — content-addressed assets (`src/middleware.js`).
- `/__lite/version` — extension live-reload stamps (`src/middleware.js`,
  payload in `src/libs/extension-preview.js`).
- `/__lite/navigation` — post-paint lazy side menu (`src/middleware.js`,
  payload in `src/libs/extension-preview.js`).
- `/__lite/runtime` — runtime identity for the in-viewer info surface
  (`src/middleware.js`, payload in `src/libs/extension-preview.js`; see
  Observability below).
- `/__lite/stats` — workspace and cache statistics for the info surface,
  bounded by the lazy contract: file metadata from the existing tree walk,
  shallow listings of the flat cache dirs, and bookkeeping the lazy backend
  (`src/libs/structure-db-lazy.js`) already computes for its own purposes —
  last page hit/miss + parse time, a session-only tree-walk history — read
  back, never recomputed. Never content reads or recursive disk scans, and
  never a new source of work: every number shown was already going to be
  produced by the normal request the info surface is describing. Diagram
  renderer routing (client vs Kroki, per language) rides on `/__lite/runtime`
  instead, since it is static config, not per-request state; the diagram
  *count* on the current page is read client-side from already-rendered DOM
  (`.diagram-shell[data-language]`) and never touches the server at all.

Static hosting has no request-time app, so a feature that needs request-time
endpoints must be off in static output. That is currently guaranteed because
the only such feature (the extension-preview surface) is enabled by a
launcher env var that static deployments never set — a new request-time
feature must state its static-mode story explicitly.

## Invariant 2 — one gate, one module, both sides

A mode flag that both emits client UI and serves that UI's endpoints must be
a single exported function read by both sides. For the extension preview this
is `extensionPreviewEnabled()` in `src/libs/extension-preview.js`, consumed
by `Layout.astro` (skeleton menu, live-reload poller script) and
`src/middleware.js` (the `/__lite/*` answers).

Rules:

- Never re-read the underlying env var at a use site; call the gate.
- Never add a side-specific extra condition (profile, backend, wrapper
  presence) to only one consumer of the gate. If the feature genuinely needs
  a narrower condition, narrow it inside the gate function so every consumer
  moves together.
- The gate is evaluated per request/render, not captured at module load, so
  one process cannot serve UI and endpoints from different gate states.

## Invariant 3 — honest statuses and defensive parsing

- An unknown URL answers **404**. The SSR catch-all (`src/pages/[...url].astro`)
  sets `Astro.response.status = 404` when the document is not found. A 200
  not-found page makes `response.ok` meaningless and turns routing mistakes
  into undiagnosable downstream parse errors.
- JSON endpoints answer `Content-Type: application/json` and
  `Cache-Control: no-store` (live state must never be cached; `/__lite/` is
  also on the HTML cache exclusion list in `config.js`/`manifest.yaml`).
- JSON consumers verify the response `Content-Type` before parsing and name
  the run-mode mismatch in their error (`src/layout/lazy_navigation.js`).
  Belt and braces: the server answers honestly *and* the client refuses to
  guess — either alone regresses silently when the other is edited.

## Environment variable strategy

Precedence (highest wins), implemented in `src/libs/load-env.js`:

1. workspace root `.env` (loaded with `override: true`),
2. shell / global environment,
3. `manifest.yaml`,
4. built-in defaults (`config.js`).

Exception: a launcher that provides explicit runtime config (the VS Code
extension) sets `MICROWEBSTACKS_DOTENV_OVERRIDE=false`, flipping 1 and 2 so
the previewed workspace's `.env` fills gaps but cannot clobber the launch
profile, port, or paths.

Rules that follow:

- **Env vars select modes; every observable combination must be legal.** If a
  flag can be set in a run mode, the feature it enables must work in that run
  mode — "this flag is only meaningful under wrapper X" is exactly the trap
  Invariant 1 removes. `MICROWEBSTACKS_EXTENSION_MODE=true` under `pnpm dev`
  is a supported, working configuration (and the recommended way to develop
  the extension-preview UI without VS Code).
- A mode flag must degrade to a no-op where its trigger is absent — and a
  *silent* no-op, not a busy one. Recurring client work (polling, retries)
  may only be emitted when its trigger can actually occur: the live-reload
  poller ships only when a launcher identity (`MICROWEBSTACKS_LAUNCHER`) is
  present, because only launchers bump the change stamps. A manual
  `pnpm dev` run polling `/__lite/version` every second could never observe
  a change; it would only flood the request log and mask real traffic.
- When diagnosing "works in one terminal, not another", suspect the `.env`
  override first: the workspace `.env` beats the shell by design, so an
  inline `VAR=x pnpm dev` does **not** win over `.env` (CLI runs keep
  override semantics on purpose — the root `.env` is the machine's single
  source of truth).

## Port strategy

- **Client code is port-blind.** Pages only ever fetch same-origin relative
  URLs (`window.location.origin` + path). No port, host, or origin is ever
  baked into rendered HTML or client scripts. This is what makes every
  port-selection policy below safe for the page itself.
- **`astro dev` auto-increments** (4321 taken → 4322 → …). Accepted for dev
  convenience; harmless for the app because of client port-blindness. Cost:
  the printed URL is the only truth about which server owns a tab — hence
  Invariant 3, so a tab pointed at the wrong server fails loudly and
  specifically instead of half-working.
- **The express wrapper binds exactly the configured port and fails fast** on
  `EADDRINUSE` with a message naming the port and the knobs
  (`MICROWEBSTACKS_PORT`, `manifest.yaml server.port`). It never silently
  picks another port: launchers (extension, service managers, users following
  a README) publish the URL before the process is up, and a drifted port
  means they publish a lie.
- **The extension chooses an ephemeral free port itself** and passes it via
  `MICROWEBSTACKS_PORT` with dotenv override disabled, so workspace `.env`
  files cannot redirect the preview.
- `/__lite/*` and `/blobs/*` are root-scoped paths; deployments under a base
  prefix (`MICROWEBSTACKS_BASE`, static only) never enable the
  extension-preview surface, so the two never meet.

## Observability — the tab must be able to explain itself

The motivating incident took a full investigation because the browser tab
carried no evidence about which kind of server owned it. Logs (the VS Code
output channel, server stdout) remain the deep-diagnosis layer, but they are
per-window and invisible from the page. Therefore:

- **Runtime identity endpoint.** `GET /__lite/runtime` (same gate as the rest
  of the surface) answers: engine version/commit (from `build-meta.json` when
  present, `package.json` for source checkouts), launcher identity, run mode
  (`dev-server` vs `built`), profile/backend/output, workspace/docs/store
  paths, the **configured** port, and process facts (node version, pid,
  uptime).
- **Launcher identity is an env pass-through.** Whatever process starts the
  server may set `MICROWEBSTACKS_LAUNCHER` (the VS Code extension sets
  `vscode-extension@<version>`); the viewer then shows the launcher↔engine
  pair. Absent means a manual CLI run. The engine never guesses its launcher.
- **In-viewer info surface.** When the extension-preview gate is on, the app
  bar shows an info icon opening a dialog that renders the runtime payload,
  live-probes the `/__lite/*` endpoints (status, content type, latency), the
  lazy menu's last load result, and a copy-diagnostics action. Port drift is
  made explicit: the dialog compares the configured port with the tab's
  actual port and flags a mismatch.
- **Error states point at the surface.** A page-visible failure of an
  extension-preview feature (e.g. the lazy menu) names the info icon in its
  message; generic errors that force users into logs are a defect.
- **Observability is never destructive.** The info surface must not be able
  to damage the page it observes: it renders as a native `<dialog>` in the
  top layer (no z-index coupling with page overlays, native Esc/close state,
  focus restore), follows the page theme via the content surface tokens (not
  the lightbox plate, which is deliberately light in dark mode), and every
  handler is error-contained — a failure inside the surface shows as text in
  the dialog or a console warning, never as a broken page. Open/close state
  has one source of truth (the dialog's native state); duplicating it in
  classes or attributes is how close buttons silently die.
- **Local only, like everything else.** The runtime payload contains local
  paths and process facts; it is served only under the extension-preview
  gate on the preview origin and is never collected or transmitted
  (no-telemetry policy, `specification/engine-profiles/spec.md`).
- **Engine storage state stays launcher-side.** Which engine versions are
  installed, stale activation artifacts, and failed cleanups live in the
  launcher's storage (VS Code globalStorage); the engine cannot see them and
  the viewer must not pretend to. Surfacing that state is the extension's
  job (output channel today; a status command is the natural extension).

## Build cache isolation — dev and build must never share a cache directory

Incident (2026-07-15): a maintainer had `pnpm dev` open with a live browser tab
on the PlantUML demo page. A `pnpm build` run in another terminal (routine
verification work) rewrote the shared default Vite dependency-optimization
cache (`node_modules/.vite`), which both commands used unless configured
otherwise. The dev server's in-memory optimizer state still pointed at a
now-missing on-demand chunk (`@plantuml/core`, only pulled in when a PlantUML
diagram is actually rendered via `plantuml-render.js`'s dynamic import); the
next request for it hung and 504'd. No PlantUML code was at fault — the two
processes had silently corrupted each other's build cache.

Fix: `astro.config.shared.mjs` derives `vite.cacheDir` from the Astro
subcommand (`node_modules/.vite-dev`, `.vite-build`, `.vite-preview`), so a
`dev` server and a `build` run can never collide even when run concurrently
against the same checkout — verified by running a full `pnpm build` while a
`pnpm dev` server stayed up and reloading the previously-broken page.

Rule: any two processes that can run concurrently against the same checkout
(a long-lived dev/preview server and a one-shot build being the concrete
case here) must not share a mutable cache directory. Prefer deriving the
cache path from what invoked the process over asking operators to remember
not to run both at once.

## Review checklist for new work

- New page-initiated fetch? The endpoint goes in `src/middleware.js` or
  `src/pages/`, never only in `server/server.js` (Invariant 1); state its
  static-output story.
- New mode flag? One gate function in one module under `src/libs/`; all
  consumers call it (Invariant 2).
- New endpoint? Correct status codes, explicit `Content-Type`, `no-store`
  when live, HTML-cache exclusion if under the wrapper cache (Invariant 3).
- New client consumer? Verify content type before parsing; error messages
  name the expected run mode (Invariant 3).
- Anything that binds a port? Decide and document: fail fast (servers with a
  published URL) or auto-select (interactive dev tools); never drift
  silently in a process whose URL someone else advertises.
