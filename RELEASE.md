# Release guide

## Shortest path

Release provenance is stamped into both shipped artifacts at packaging time:

- the VSIX gets `buildMetadata` in `package.json` plus `build-meta.json`;
- the npm engine tarball gets the same;
- the extension logs the stamped build info for both the extension and the
  resolved engine at startup.

For that stamp to identify an exact source state, create the release commit
before packaging or publishing. If you package from a dirty worktree, the stamp
records that too.

### Engine (only when `src/`, `server/`, `scripts/`, or `config.js` changed)

1. Bump `engineVersion` in `packages/vscode-extension/package.json` (never reuse a number).
2. Commit the release changes locally so the stamped commit hash points at a real commit.
3. Publish (OTP = fresh code from your npm authenticator; `npm login` first if logged out):

```powershell
pnpm engine:release --otp=<code>
```

If the OTP expires while the build runs, rerun with a fresh code:
`pnpm engine:release --otp=<fresh-code> --publish-only`

### Extension

1. Bump `version` in `packages/vscode-extension/package.json` (strictly increasing, never reuse).
2. Commit the release changes locally if you did not already do so for the engine release.
3. Package (checks the pinned engine is on npm, stages the bundled lite/json engine fallback into the VSIX, then builds the vsix with the current git commit stamped into it):

```powershell
pnpm ext:release
```

4. Test locally: `pnpm ext:install`, reload VS Code, run **Markdown Site Preview: Open Preview** in a docs folder.
5. **Manual:** upload `packages/vscode-extension/markdown-site-preview.vsix` at
   <https://marketplace.visualstudio.com/manage/publishers/microwebstacks>
   (extension `...` menu -> **Update**; new listing: **New extension -> VS Code**).
6. Push the release commit when ready.

## Who ships what

Three artifacts live in this repo. Knowing which one a change touches tells you
exactly what to release:

| Artifact | Source | Ships as | Ships to |
|---|---|---|---|
| **Engine** (the renderer) | `src/`, `server/`, `scripts/`, `config.js` | `@microwebstacks/md-render` (staged build artifact in `packages/md-render/`, gitignored) | npm registry |
| **Extension** (VS Code launcher + bundled lite/json fallback) | `packages/vscode-extension/` (`extension.js`, `package.json`, `README.md`) | `markdown-site-preview.vsix` | VS Code Marketplace |
| **Repo** | everything | git commits | GitHub (branch `main`) |

The release VSIX now contains a bundled lite/json engine payload for offline
and corporate-safe first run. In normal `auto` mode the installed extension:

1. uses `enginePath` when explicitly configured;
2. uses a source checkout when the extension itself is running from one;
3. hydrates the bundled engine into VS Code storage and runs that copy;
4. falls back to an already installed published engine;
5. only then downloads the pinned published engine package.

So:

- **npm publish** makes a new engine available.
- **Marketplace upload** ships both the extension wrapper and its bundled
  fallback, and also makes extensions ask for the pinned published engine when
  the registry path is used.
- **git push** publishes neither; it is version control only.

## Decision rule

- Changed only `packages/vscode-extension/*` -> **extension release** (no npm publish).
- Changed `src/`, `server/`, `scripts/`, or `config.js` -> **engine release**, then an
  **extension release** to bump `engineVersion` so installed extensions pick it up.
- Docs/plans only -> just commit.

## Order matters

Always **npm publish the engine before uploading the extension** that pins it.
The bundled VSIX fallback means first preview no longer depends on registry
access, but explicit `engineSource=registry` usage and the network fallback path
still depend on the pinned engine version existing on npm. `pnpm ext:release`
enforces this check.

Recommended full release order:

1. Edit versions (`engineVersion` first if engine code changed, then extension `version`).
2. Commit those release changes locally.
3. Run `pnpm engine:release --otp=<code>` when engine/runtime code changed.
4. Run `pnpm ext:release`.
5. Run `pnpm ext:install` and smoke-test the installed extension.
6. Upload the VSIX to the Marketplace.
7. Push the release commit.

## Never reuse a version number

One version = one binary, forever - even for local-only rebuilds. If you change
a single line after packaging, bump the version before repackaging. VS Code only
offers an update when the Marketplace version is **strictly greater** than the
installed one, so a fixed build re-labeled with an already-shipped version is
invisible to every existing install, and the Marketplace refuses re-uploads of
the same version anyway. (Learned 2026-07-02: two different 0.0.5 builds existed;
the unfixed one reached the Marketplace, so the fix had to ship as 0.0.6.)
`pnpm engine:release` refuses versions that are already on npm.

## Clean-machine smoke gate (recommended for engine releases)

Catches native-dep leaks that repo-local tests hide: `npm pack packages/md-render`
after staging, `npm install` the tarball into a folder OUTSIDE the repo with
`--omit=optional`, then run `scripts/collect.js` + `server/server.js` from the
installed package (`DOCS_PROFILE=lite`, `DOCS_BACKEND=json`,
`MICROWEBSTACKS_WORKSPACE_ROOT=<scratch docs folder>`) and check pages return 200.

## Build environment caveat

The repo `.env` pins `DOCS_PROFILE=full` and OVERRIDES the shell env (see
`src/libs/load-env.js`). Lite builds must point `MICROWEBSTACKS_WORKSPACE_ROOT`
at an empty directory so the profile takes effect - `pnpm engine:release` does
this automatically.

## Marketplace notes

- Renaming `name` in `package.json` changes the extension ID: the upload creates
  a **new** marketplace entry. Unpublish the old one manually from the publisher
  page.
- Existing users receive updates via VS Code auto-update; on next preview start
  the extension hydrates the bundled engine into a fresh
  `bundled-engine-<version>` folder (or installs the pinned published engine
  into `engine-<version>` when the registry path is used) and cleans old ones
  up best-effort.
- README images must be absolute URLs reachable on `main` (vsce's relative-link
  rewrite drops the `repository.directory` prefix and would break them).

## Git

Commit and push independently of the above (GitHub is not part of either publish
pipeline). Keep the repo in sync with what was published: commit before staging
so the stamped commit hash names a real source state, and tag or note the
engine version in the commit message when publishing.
