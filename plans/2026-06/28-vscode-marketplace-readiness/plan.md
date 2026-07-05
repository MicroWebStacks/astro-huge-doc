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
- Zero-config must not break this repository's current standalone development
  and renderer workflow. If the packaging work would force disruptive repo
  constraints, split the extension into a separate repository before publish.
- Runtime packaging uses Option B: ship the renderer as a versioned Node engine
  package that the extension installs/spawns, rather than bundling the full
  native stack inside one VSIX.
- First release ships to the Marketplace flagged as a preview/pre-release.
- First release targets Windows x64 only, explicitly labeled in the listing.
- The first ship documents that a system Node runtime is required; true
  no-Node zero-config is deferred.

## Current Evidence

- `packages/vscode-extension/package.json` is marked `"private": true`.
- The extension manifest includes a publisher and commands, but not the full
  Marketplace-facing metadata surface.
- The currently generated VSIX contains only `extension/package.json` and
  `extension/extension.js`.
- `extension.js` still resolves a rendering engine through `enginePath` or
  repo-relative candidates.
- `README.md` still documents local `C:\dev\...` development paths for the
  extension flow.
- The renderer defaults to a Kroki-hosted diagram rendering service unless
  configured otherwise.
- `vsce` is not on this shell's PATH, so this packet records a static readiness
  plan rather than a completed Marketplace validation run.

## Hard Blockers

### BLK-001 - The VSIX is not self-contained

Status: open

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
without setting `microwebstacks.preview.enginePath`.

### BLK-002 - Runtime packaging strategy must preserve standalone repo usage

Status: open

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

Selected direction: Option B. Publish the renderer as a versioned Node engine
package (built/staged from this repo) that the extension installs or spawns.
This keeps the VSIX small, lets the platform's package manager resolve native
modules (`better-sqlite3`, `duckdb`, `sharp`) per platform/ABI, and leaves the
source repository's standalone `pnpm build`/`collect`/preview flows untouched.
Keep `enginePath` only as an advanced development override. First-run install
mechanism is registry install of `@microwebstacks/md-render` from npm; a
bundled-tarball offline install is a deferred optimization. Trade-offs accepted
for the preview: first-run latency, and a first-use requirement for network
access plus npm/build tooling on the user's machine. This network requirement is
fetching engine *code* from npm only — it does not send the user's documentation
anywhere, and is independent of the opt-in hosted diagram rendering in BLK-005.

Note (hidden constraint): the extension spawns a child `node` process, so even
with the engine packaged the user must have a compatible system Node runtime on
PATH whose ABI matches the engine's prebuilt native modules. True no-Node
zero-config (bundling a Node runtime or running the server in-process in the
extension host) is explicitly deferred past the first preview release. The first
release documents the Node requirement and surfaces a clear error when it is
missing or mismatched.

### BLK-003 - Native dependency compatibility is unproven

Status: open

The renderer stack uses native modules and server-side dependencies. Public
release requires a compatibility matrix across Windows, macOS, and Linux, and
possibly x64/arm64.

Exit requirement: package, install, and smoke-test the extension on supported
platforms with no repo checkout and no global pnpm/vsce dependency at runtime.

### BLK-004 - Marketplace metadata and content are incomplete

Status: open

The extension package needs the public listing surface expected by `vsce` and
Marketplace users:

- remove `"private": true`
- `repository`
- `license`
- `icon` using a non-SVG image
- `keywords`
- appropriate `categories`
- `bugs` or support URL
- extension-local `README.md`
- `CHANGELOG.md`
- `.vscodeignore` or a deterministic package allowlist

The Marketplace docs also constrain README and changelog images: image URLs
must be `https`, and SVG images are restricted.

### BLK-005 - Privacy behavior around diagram rendering must be explicit

Status: open

The default diagram renderer can send diagram source to `https://kroki.io`.
That may be surprising for users previewing private documentation.

Decision: hosted diagram rendering is opt-in.

Exit requirement: implement a default that does not send diagram source to a
hosted service, add settings and README disclosure for hosted rendering, and
provide local renderer examples such as a Docker container or Docker Compose
setup with the required dependencies.

### BLK-006 - Update and publish automation is not defined

Status: open

Pushing to GitHub does not update VS Code Marketplace by itself. The release
flow must publish a new extension version through `vsce` or Marketplace upload.

Exit requirement: choose manual `vsce publish`, GitHub Actions with a secret,
or Azure DevOps/Entra-based secure publishing.

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
- Add an extension bootstrap that, on first run, installs the engine package
  from the npm registry (`npm install @microwebstacks/md-render@<pinned>`) into
  VS Code extension storage and spawns it from there instead of from a repo
  checkout. Registry install lets the package manager fetch prebuilt native
  modules for the user's platform/ABI automatically.
- First-run mechanism is registry install. A bundled-tarball (offline) install
  is deferred as a later optimization once cross-platform support and size
  optimization are in scope.
- Keep `enginePath` only as a development override.
- Surface a clear error when system Node is missing or its ABI does not match
  the engine's prebuilt native modules.
- Add `.vscodeignore` / explicit allowlist so the thin VSIX ships no repo source.
- Ensure no generated DB/cache writes happen under the installed extension path.

Exit criteria:

- A clean-profile VSIX install bootstraps the engine package and starts the
  preview without `enginePath` (system Node present).
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
| Package content | VSIX contains all runtime files and no private/cache files | open |
| Clean install | Works without `enginePath` | open |
| Native modules | Works on supported platforms | open |
| Workspace storage | DB/cache writes stay in extension storage | partially proven locally |
| Local server | Binds localhost only in extension mode | partially proven locally |
| Webview | CSP and port mapping work | partially proven locally |
| Diagrams | Privacy default accepted and tested | open |
| Metadata | `vsce package` has no blocking warnings | open |
| Docs | README/changelog are Marketplace-ready | open |
| Updates | Version/publish automation defined | open |

## Non-Goals

- Browser-based VS Code or `vscode.dev` support.
- Cloud sync or hosted preview service.
- Hosted diagram rendering enabled by default.
- Replacing the Astro SSR renderer.
- Building a new UI around the extension before publish readiness.
- Git history operations in this packet.

## Publish Readiness Exit Criteria

The extension is ready to publish when all hard blockers are closed and:

1. The release VSIX installs into a clean VS Code profile.
2. Preview works with no local `astro-huge-doc` checkout.
3. Package inspection shows no local/private/generated data.
4. `vsce package` and `vsce publish --dry-run` or equivalent checks pass.
5. README, changelog, license, icon, repository, and support links are present.
6. Privacy behavior for local server, workspace files, and diagram rendering is
   documented.
7. The maintainer has approved publisher ID, release channel, and update flow.

## Official References

- VS Code publishing extensions:
  https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- VS Code extension manifest:
  https://code.visualstudio.com/api/references/extension-manifest
- VS Code webview guidance:
  https://code.visualstudio.com/api/extension-guides/webview
