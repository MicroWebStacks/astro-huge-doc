# VS Code Marketplace Publish Readiness Plan

## Problem Summary

The VS Code extension is mature enough for local preview testing, but it is not
yet ready for a public VS Code Marketplace release. The current package is a
thin local helper around this repository's Astro SSR engine. A Marketplace user
would install only the extension wrapper, while the renderer, build output,
scripts, dependencies, and native modules still live in the repository checkout.

This packet defines the guard rails, blockers, design decisions, and validation
steps needed before publishing `microwebstacks-docs-preview` publicly.

## Goal

Prepare the extension for a public VS Code Marketplace release that installs,
runs, updates, and fails safely on a clean user machine without requiring a
local `astro-huge-doc` checkout.

## Accepted Maintainer Decisions

- Launch target is desktop VS Code only. Browser-based VS Code and
  `vscode.dev` remain non-goals.
- Hosted diagram rendering must be opt-in, not the default behavior for private
  documentation.
- Local diagram rendering examples should be part of the publish-readiness
  work, including a Docker-based path that starts the required rendering
  services locally.
- Marketplace repository identity is acceptable as currently intended.
- The preferred public install promise is zero-config: users should not need a
  local `astro-huge-doc` checkout to preview docs from VS Code.
- Zero-config should also tolerate corporate/firewalled machines. A release
  VSIX should carry a bundled lite/json engine fallback so first preview does
  not depend on reaching the npm registry.
- Zero-config must not break this repository's current standalone development
  and renderer workflow. If the packaging work would force disruptive repo
  constraints, split the extension into a separate repository before publish.
- Runtime packaging uses a hybrid of Option B plus a bundled fallback: keep the
  renderer as a versioned Node engine package, but also ship the lite/json
  engine inside the VSIX as an offline/corporate-safe fallback before trying a
  registry download.
- First release ships to the Marketplace flagged as a preview/pre-release.
- First release targets Windows x64 only, explicitly labeled in the listing.
- The installed extension should use VS Code's own bundled runtime plus an
  npm-free HTTPS tarball installer for the lite/json engine; system Node stays
  only as a documented fallback when a VS Code/Electron build does not allow
  `ELECTRON_RUN_AS_NODE=1`.

## Current Evidence

- `packages/vscode-extension/package.json` is public (`"private": false`) and
  now includes Marketplace-facing metadata plus a pinned `engineVersion`.
- The extension manifest includes a publisher, commands, categories, keywords,
  repository/bugs links, license, non-SVG icon, and an extension-local README.
- `extension.js` now resolves a rendering engine through `enginePath`,
  repo-relative candidates, a bundled VSIX engine, or a versioned installed
  engine in extension storage.
- `extension.js` now installs the engine with an in-process HTTPS tarball
  download/extract path instead of shelling out to `npm`.
- `extension.js` now prefers VS Code's own runtime
  (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`) for collect/diagrams/server
  script execution, with explicit override / fallback paths if unavailable.
- `README.md` and the extension-local README no longer document local
  `C:\dev\...` development paths.
- The renderer's default `kroki.server` (`config.js`) is
  `http://localhost:18000`, not a hosted service; hosted rendering is opt-in
  via `microwebstacks.preview.krokiServer`.
- `@microwebstacks/md-render@0.0.7` is published on the npm registry
  (`content-structure` is now a normal semver dependency, not a local-path
  dependency), so the registry-install tier is exercisable end to end.
- `vsce`, `pnpm`, and the `code` CLI are all available in this environment as
  of 2026-07-09, so packaging and clean-profile validation are no longer
  blocked on tooling availability.

## Hard Blockers

### BLK-001 - The VSIX is not self-contained

Status: resolved

`scripts/package-extension.js` stages and verifies a bundled `bundled-engine/`
payload (server, scripts, built SSR output, vendored `node_modules`) inside
the packaged VSIX itself. Proven end to end on 2026-07-09: the real VSIX was
installed into a fully isolated `--user-data-dir`/`--extensions-dir` profile
(no repo checkout, no `enginePath`), opened against a plain Markdown workspace
with no `manifest.yaml`, and `microwebstacks.previewDocs` served real rendered
content over `127.0.0.1` (HTTP 200, 29 KB body) using only the bundled
engine. See `implementation.md` and `test.md` for the run details.

The packaged extension currently does not include the runtime needed to collect,
render, and serve documentation. A clean Marketplace install would not have:

- `server/server.js`
- `scripts/collect.js`
- `scripts/diagrams.js`
- `dist/server/entry.mjs`
- runtime assets
- runtime dependencies
- native modules such as `better-sqlite3`, `duckdb`, or `sharp`

Exit requirement: installing the VSIX into a clean VS Code profile must work
without setting `microwebstacks.preview.enginePath`, and should not require npm
registry access when using the release VSIX.

### BLK-002 - Runtime packaging strategy must preserve standalone repo usage

Status: resolved

The extension needs a clear production architecture before public release.
Current local-engine discovery is acceptable for development, but not for a
public extension. The selected approach must make the Marketplace extension
self-contained by default without breaking this repository's current standalone
`pnpm build`, `pnpm collect`, and local preview flows.

Candidate approaches:

| Option | Description | Pros | Risks |
| --- | --- | --- | --- |
| A | Bundle the engine and built SSR output inside the VSIX | Best user experience; no bootstrap step | Native dependency size and platform compatibility |
| B | Split a stable Node package and install/use it from the extension | Cleaner long-term architecture | Network/package-manager expectations and slower first run |
| C | Publish as a documented preview that requires `enginePath` | Fastest | Not Marketplace-grade for general users |

Selected direction: Option B with an Option A-style bundled fallback for the
lite/json runtime. Publish the renderer as a versioned Node engine package
(built/staged from this repo), but also package the same lite/json engine
artifact inside the VSIX so corporate/offline installs can start preview with
no registry reachability. Runtime resolution order should be:

1. `enginePath` (explicit development override)
2. bundled engine shipped inside the VSIX
3. previously installed engine in extension storage
4. HTTPS download/extract of the pinned published engine package

This keeps the source repository's standalone `pnpm build`/`collect`/preview
flows untouched, preserves the versioned engine architecture, and removes
registry access as a first-run requirement for normal VSIX installs.
Keep `enginePath` only as an advanced development override. Registry download
remains useful for explicit production-path testing and future decoupled engine
updates, but no longer blocks corporate installs on day one. When registry
download is used, it fetches engine *code* only - it does not send the user's
documentation anywhere, and is independent of the opt-in hosted diagram
rendering in BLK-005.

Updated hidden constraint: the installed lite/json engine no longer requires a
system Node runtime on the common path. The extension prefers VS Code's own
bundled runtime (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`) to run
collect/diagrams/server. Some Electron builds may disable the `runAsNode`
fuse, so `MICROWEBSTACKS_NODE_PATH` and system `node` remain documented
fallbacks with a clear error if neither route works.

### BLK-003 - Native dependency compatibility is unproven

Status: resolved for Windows x64 (this preview's only target); macOS/Linux
explicitly out of scope

Per OP-002, the first preview release targets Windows x64 only; macOS and
Linux compatibility is an explicit post-preview follow-up and was not pursued
in this pass (by maintainer direction). The lite/json engine profile used by
the bundled VSIX fallback has no native module dependency
(`better-sqlite3`/`duckdb`/`sharp` are only loaded by the sqlite/full
profile), which is why the clean-profile Windows run below had nothing
platform-specific to fail on.

Exit requirement met (Windows x64, this pass): the packaged VSIX was
installed and smoke-tested on a clean Windows VS Code profile with no repo
checkout and no global pnpm/vsce dependency at runtime (2026-07-09, see
`implementation.md`). Cross-platform (macOS/Linux) validation remains open
and explicitly out of scope until a post-preview pass.

### BLK-004 - Marketplace metadata and content are incomplete

Status: resolved

`packages/vscode-extension/package.json` and directory now have all of:
`"private": false`, `repository`, `license` (MIT), non-SVG `icon` (`icon.png`),
`keywords`, `categories`, `bugs` URL, extension-local `README.md`,
`CHANGELOG.md`, and `.vscodeignore`. `vsce package` runs from this metadata
without blocking warnings (see `RELEASE.md`).

### BLK-005 - Privacy behavior around diagram rendering must be explicit

Status: resolved

Decision: hosted diagram rendering is opt-in.

`config.js`'s default `kroki.server` is `http://localhost:18000`, never a
hosted service; `microwebstacks.preview.krokiServer` must be explicitly set to
opt into `https://kroki.io` or another remote endpoint. `compose.yaml` at the
repo root defines a local Kroki service (`docker compose up -d` /
`pnpm kroki:up`, `down` / `pnpm kroki:down`), documented in the root README's
"local Docker Kroki" section. The extension-local README now has a
self-contained "Local Kroki via Docker" section with a plain `docker run`
one-liner for Marketplace users who have no repo checkout (and therefore no
`compose.yaml`), plus a pointer to the repo's compose file for checkout users.

### BLK-006 - Update and publish automation is not defined

Status: resolved

`RELEASE.md` documents the chosen flow: manual `pnpm engine:release` (npm
publish, OTP-gated) for engine changes, then `pnpm ext:release` (packages,
verifies the bundled engine landed in the VSIX, stamps build metadata) plus a
manual VSIX upload at
`https://marketplace.visualstudio.com/manage/publishers/microwebstacks`. A
decision rule maps which artifact to release for a given change. GitHub push
is explicitly documented as publishing neither artifact.

Remaining gap: this flow has never been exercised for a real first
Marketplace publish (see Publish Readiness Exit Criteria).

## Design Decisions Needed

### OP-001 - What is the public install promise?

Status: resolved

Decision needed: should users be able to install the extension and preview docs
with no additional setup?

Decision: yes. A Marketplace extension should work from install plus command
execution, without a local `astro-huge-doc` checkout. Keep advanced settings for
custom engine development, not as the default path.

Clarification: zero-config means the published extension contains or can
directly access its runtime without asking the user to clone this repo. It does
not mean removing standalone repo usage. The safe implementation is to generate
a release package from this repo while keeping source development unchanged.

### OP-002 - Which platforms are supported at launch?

Status: resolved

Decision: desktop VS Code, Windows x64 only at launch, explicitly labeled in the
Marketplace listing. The preview flag (OP-005) sets the expectation that other
platforms are not yet validated.

Follow-up (post-preview): add macOS x64/arm64 and Linux x64 once the engine
package's native modules are confirmed to resolve cleanly per platform/ABI.

### OP-003 - How should native modules be packaged?

Status: resolved

Decision: do not bundle native modules in the VSIX. Per the Option B direction
in BLK-002, native modules ship inside the separate `@microwebstacks/md-render` engine
package and are resolved per platform/ABI by the package manager at registry
install time. For the first preview the only validated target is Windows x64.
The VSIX itself stays platform-neutral and thin.

### OP-004 - What is the diagram privacy default?

Status: resolved

Decision needed: keep hosted Kroki as default, make it opt-in, or require a
user-configured/local renderer.

Decision: hosted rendering is opt-in. The default public extension behavior
must not send diagram source to a hosted renderer. Add local renderer guidance,
including Docker-based examples.

### OP-005 - What release channel is this?

Status: resolved

Decision: publish to the Marketplace flagged as a preview/pre-release. A
signed-off private VSIX/GitHub validation pass should still run before the
preview goes live, but the public channel is Marketplace-preview, not stable.
Promote to stable only after cross-platform coverage and blocker closure.

### OP-006 - What publisher/repository identity is final?

Status: resolved

Decision needed: confirm the Marketplace publisher ID `microwebstacks`, final
extension name, repository URL, issue tracker, and support contact.

Decision: repository identity is acceptable as currently intended. Still verify
the exact Marketplace publisher ID, issue URL, and support URL before first
publish because they become part of the public listing surface.

### OP-007 - Does publish readiness require a separate repository?

Status: resolved as conditional

Decision needed: should the extension move out of this repository before
Marketplace publication?

Decision: not by default. Keep the extension in this repository if zero-config
can be implemented as a generated release package that does not break standalone
repo workflows. Move to a separate repository only if packaging imposes
conflicting dependency, build, release, or source-layout requirements.

### OP-008 - Should the release VSIX embed a bundled engine fallback?

Status: resolved

Decision: yes. The public install promise now includes firewalled/corporate
machines where direct npm registry access may fail. Keep the versioned engine
package architecture, but ship the lite/json engine artifact inside the VSIX
and prefer it before any network install path.

## Implementation Phases

### Phase 1 - Baseline Audit And Package Inventory

- Rebuild the current VSIX from a clean workspace.
- Inspect package contents.
- Run `vsce package` and capture all warnings.
- Inventory runtime files required for a clean extension install.
- Decide which generated outputs are build artifacts versus source files.

Exit criteria:

- A package manifest lists every runtime file needed by the installed extension.
- The plan identifies files that must never be shipped, such as `.env`,
  workspace caches, local VSIXs, `content/`, `dataset/`, and `.tmp/`.

### Phase 2 - Engine Package + Extension Bootstrap (Option B)

- Define a versioned Node engine package (`@microwebstacks/md-render`)
  containing `server/`, `scripts/collect.js`, `scripts/diagrams.js`, the built
  Astro SSR output (`dist/server/entry.mjs`), runtime assets, and its production
  dependencies (including native modules).
- Add a build/stage script that produces this package from the repo without
  moving source files out of their current locations.
- Stage a bundled lite/json engine payload into the VSIX so the installed
  extension can resolve an offline engine without contacting the registry.
- Add an extension bootstrap that, on first run, downloads the published
  `@microwebstacks/md-render` tarball over HTTPS into VS Code extension
  storage, extracts it locally, and spawns it from there instead of from a
  repo checkout.
- Resolve engine sources in a deterministic order: `enginePath`, bundled VSIX
  engine, previously installed engine, then HTTPS download/extract of the
  pinned published engine package.
- First-run mechanism for the public VSIX is now bundled-engine first.
  Registry bootstrap becomes a fallback path rather than the default path.
- Keep `enginePath` only as a development override.
- Surface a clear error when neither VS Code's bundled runtime nor a fallback
  Node path can run the engine scripts.
- Add `.vscodeignore` / explicit allowlist so the thin VSIX ships no repo source.
- Ensure no generated DB/cache writes happen under the installed extension path.

Exit criteria:

- A clean-profile VSIX install starts the preview without `enginePath`,
  without system Node/npm on PATH, and without npm registry access.
- The installed extension writes generated preview state and the engine install
  only under VS Code extension/workspace-scoped storage.
- `pnpm build`, `pnpm collect`, and local repository preview flows continue to
  work from the source checkout.

### Phase 3 - Runtime Hardening

- Replace avoidable `shell: true` subprocess spawning.
- Pass a minimal child-process environment instead of inheriting all of
  `process.env`.
- Add clearer user-facing errors for missing Node/runtime/native module issues.
- Confirm server binding stays on `127.0.0.1` for extension mode.
- Review webview CSP and localhost frame behavior.
- Add cancellation/cleanup handling for refresh and restart loops.

Exit criteria:

- Extension subprocesses do not depend on shell behavior for normal paths.
- Runtime failures are visible in the output channel and do not leave orphaned
  servers.

### Phase 4 - Marketplace Metadata And Documentation

- Create extension-local `README.md` focused on install, use, privacy, and
  troubleshooting.
- Add `CHANGELOG.md`.
- Add non-SVG icon and optional gallery metadata.
- Add repository, license, bugs/support URL, keywords, and categories.
- Remove local machine paths from public-facing docs.
- Document the update model: version bump plus `vsce publish`, not just GitHub
  push.

Exit criteria:

- `vsce package` emits no blocking metadata warnings.
- The Marketplace README describes exactly what runs locally and what can call
  external services.

### Phase 5 - Privacy, Security, And Trust Review

- Document local server behavior and localhost-only binding.
- Document filesystem access scope: workspace docs read, generated state in
  VS Code extension storage.
- Implement hosted diagram rendering as opt-in.
- Add a local diagram renderer guide with Docker-based examples.
- Check that `.env`, tokens, collected private content, DBs, and caches cannot
  enter the VSIX.
- Confirm no telemetry is added without explicit disclosure.

Exit criteria:

- A privacy note exists in the README.
- Hosted diagram rendering is disabled until explicitly enabled and has clear
  disclosure.
- Local diagram rendering can be launched from documented commands.
- Package inspection confirms no private local data is included.

### Phase 6 - Platform Validation

First preview release validates Windows x64 only. macOS x64/arm64 and Linux x64
are post-preview follow-ups (see OP-002) and are gated on the engine package's
native modules resolving cleanly per platform/ABI.

Run the release candidate VSIX on each in-scope platform:

For each platform:

- install into a clean VS Code profile
- open a plain Markdown workspace with no `manifest.yaml`
- run preview
- edit a Markdown file and confirm refresh
- open in browser
- stop/restart server
- preview a page with image assets
- preview a page with diagram content according to the chosen privacy default

Exit criteria:

- Supported platforms are listed in README.
- Unsupported platforms or known native-module limits are explicitly stated.

### Phase 7 - Publishing Flow

- Confirm Marketplace publisher ownership.
- Choose auth model:
  - manual `vsce login` and `vsce publish`
  - GitHub Actions with publishing secret
  - Azure DevOps secure publishing with Microsoft Entra ID
- Decide whether `vsce publish` may create version commits/tags, or whether
  versioning remains manually controlled by the maintainer.
- Publish a pre-release/private VSIX first if needed.
- Publish Marketplace release only after validation sign-off.

Exit criteria:

- Release checklist exists.
- Versioning policy is documented.
- First Marketplace publish is reproducible.

## Validation Matrix

| Area | Required Check | Status |
| --- | --- | --- |
| Package content | VSIX contains all runtime files and no private/cache files | proven (2026-07-09 clean-profile run) |
| Clean install | Works without `enginePath` | proven (2026-07-09, Windows x64) |
| Native modules | Works on supported platforms | proven for Windows x64 (lite/json profile has no native deps); macOS/Linux out of scope this pass |
| Workspace storage | DB/cache writes stay in extension storage | proven (2026-07-09 clean-profile run used isolated storage only) |
| Local server | Binds localhost only in extension mode | proven (code review + clean-profile run: server reachable only on 127.0.0.1) |
| Webview | CSP and port mapping work | reviewed (CSP scopes iframe to the extension's own port); command-level exercise proven, webview panel rendering itself not screenshot-verified |
| Diagrams | Privacy default accepted and tested | proven (default is `localhost:18000`; `compose.yaml` + `docker run` instructions verified to parse/be correct, daemon not available in this sandbox to render an actual diagram) |
| Metadata | `vsce package` has no blocking warnings | proven (only the expected file-count/bundle-size advisory warning; no blocking errors) |
| Docs | README/changelog are Marketplace-ready | proven (README/CHANGELOG present, no local dev paths, local-Kroki instructions added) |
| Updates | Version/publish automation defined | proven (`RELEASE.md`); a real first Marketplace publish is still outstanding |

## Non-Goals

- Browser-based VS Code or `vscode.dev` support.
- Cloud sync or hosted preview service.
- Hosted diagram rendering enabled by default.
- Replacing the Astro SSR renderer.
- Building a new UI around the extension before publish readiness.
- Git history operations in this packet.

## Publish Readiness Exit Criteria

The extension is ready to publish when all hard blockers are closed and:

1. The release VSIX installs into a clean VS Code profile. **Done** (2026-07-09).
2. Preview works with no local `astro-huge-doc` checkout. **Done** (2026-07-09,
   Windows x64).
3. Package inspection shows no local/private/generated data. **Done** - the
   VSIX contents listed by `vsce package` are extension code, license,
   changelog, icon, images, and the bundled engine (server/scripts/dist/vendored
   deps); nothing from `content/`, `dataset/`, `.env`, or `.tmp/`.
4. `vsce package` and `vsce publish --dry-run` or equivalent checks pass.
   **Partially done** - `vsce package` succeeds with only the expected
   file-count advisory warning; `vsce publish --dry-run` (which needs a
   Marketplace PAT) has not been run.
5. README, changelog, license, icon, repository, and support links are
   present. **Done**.
6. Privacy behavior for local server, workspace files, and diagram rendering is
   documented. **Done**.
7. The maintainer has approved publisher ID, release channel, and update flow.
   **Done** per the Accepted Maintainer Decisions above; the update flow
   itself (`RELEASE.md`) has not yet been exercised for a real first publish.

Remaining before a real Marketplace publish: run `vsce publish --dry-run` (or
log in and do the actual first publish), and decide whether/when to pursue
macOS/Linux validation (currently out of scope for this preview).

## Official References

- VS Code publishing extensions:
  https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- VS Code extension manifest:
  https://code.visualstudio.com/api/references/extension-manifest
- VS Code webview guidance:
  https://code.visualstudio.com/api/extension-guides/webview
