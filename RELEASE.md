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
2. Add the release entry to the root `CHANGELOG.md`. This is the engine
   changelog and is included in the npm tarball; the extension has its own
   changelog under `packages/vscode-extension/`.
3. Commit the release changes locally so the stamped commit hash points at a real commit.
4. Publish (OTP = fresh code from your npm authenticator; `npm login` first if logged out):

```powershell
pnpm engine:release --otp=<code>
```

If the OTP expires while the build runs, rerun with a fresh code:
`pnpm engine:release --otp=<fresh-code> --publish-only`

### Extension

1. Bump `version` in `packages/vscode-extension/package.json` (strictly increasing, never reuse).
2. Commit the release changes locally if you did not already do so for the engine release.
3. Package (checks the pinned engine is on npm for standalone consumers, stages the bundled lite/json engine into the VSIX, builds the vsix with the current git commit stamped into it, and fails if the final archive does not actually contain `bundled-engine/`):

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
| **Extension** (VS Code launcher + bundled lite/json engine) | `packages/vscode-extension/` (`extension.js`, `package.json`, `README.md`) | `markdown-site-preview.vsix` | VS Code Marketplace |
| **Repo** | everything | git commits | GitHub (branch `main`) |

The release VSIX contains a bundled lite/json engine payload for offline and
corporate-safe startup. The installed extension:

1. uses `enginePath` when explicitly configured;
2. uses a source checkout when the extension itself is running from one;
3. hydrates the bundled engine into VS Code storage and runs that copy.

So:

- **npm publish** makes a new engine available.
- **Marketplace upload** ships both the extension wrapper and its bundled
  engine. The extension does not acquire engine code from npm at runtime.
- **git push** publishes neither; it is version control only.

## Decision rule

- Changed only `packages/vscode-extension/*` -> **extension release** (no npm publish).
- Changed `src/`, `server/`, `scripts/`, or `config.js` -> **engine release**.
- Follow with an **extension release** only when Marketplace users should
  immediately receive that engine in the VSIX's bundled payload. Action/CLI-only
  engine fixes can ship without a new extension version; the bumped
  `engineVersion` is then ready for the next extension release.
- Docs/plans only -> just commit.

## Order matters

Always **npm publish the engine before uploading the extension** that pins it.
The extension itself runs its bundled copy without registry access; publishing
the same engine remains required for Action, CLI, Pages, and other standalone
consumers. `pnpm ext:release` continues to enforce the coordinated release
check.

Recommended full release order:

1. Edit versions (`engineVersion` first if engine code changed, then extension `version`
   only if an extension release is also intended) and update the matching changelog(s).
2. Commit those release changes locally.
3. Run `pnpm engine:release --otp=<code>` when engine/runtime code changed.
4. If releasing the extension too, run `pnpm ext:release`.
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
  `bundled-engine-<version>` folder and cleans old ones up best-effort.
- README images must be absolute URLs reachable on `main` (vsce's relative-link
  rewrite drops the `repository.directory` prefix and would break them).

## Git

Commit and push independently of the above (GitHub is not part of either publish
pipeline). Keep the repo in sync with what was published: commit before staging
so the stamped commit hash names a real source state, and tag or note the
engine version in the commit message when publishing.
