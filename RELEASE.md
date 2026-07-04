# Release guide

## Shortest path

### Engine (only when `src/`, `server/`, `scripts/`, or `config.js` changed)

1. Bump `engineVersion` in `packages/vscode-extension/package.json` (never reuse a number).
2. Publish (OTP = fresh code from your npm authenticator; `npm login` first if logged out):

```powershell
node scripts/release-engine.js --otp <code>
```

If the OTP expires while the build runs, rerun with a fresh code:
`node scripts/release-engine.js --otp <fresh-code> --publish-only`

### Extension

1. Bump `version` in `packages/vscode-extension/package.json` (strictly increasing, never reuse).
2. Package (checks the pinned engine is on npm, then builds the vsix):

```powershell
node scripts/release-extension.js
```

3. Test locally: `pnpm ext:install`, reload VS Code, run **Markdown Site Preview: Open Preview** in a docs folder.
4. **Manual:** upload `packages/vscode-extension/markdown-site-preview.vsix` at
   <https://marketplace.visualstudio.com/manage/publishers/microwebstacks>
   (extension `…` menu → **Update**; new listing: **New extension → VS Code**).
5. Commit and push `main`.

## Who ships what

Three artifacts live in this repo. Knowing which one a change touches tells you
exactly what to release:

| Artifact | Source | Ships as | Ships to |
|---|---|---|---|
| **Engine** (the renderer) | `src/`, `server/`, `scripts/`, `config.js` | `@microwebstacks/md-render` (staged build artifact in `packages/md-render/`, gitignored) | npm registry |
| **Extension** (the thin VS Code launcher) | `packages/vscode-extension/` (`extension.js`, `package.json`, `README.md`) | `markdown-site-preview.vsix` | VS Code Marketplace |
| **Repo** | everything | git commits | GitHub (branch `main`) |

The extension does not contain the renderer. At runtime it npm-installs the
engine version pinned by `engineVersion` in `packages/vscode-extension/package.json`
into VS Code's globalStorage (`engine-<version>/`). So:

- **npm publish** makes a new engine available.
- **Marketplace upload** makes extensions ask for it (via `engineVersion`).
- **git push** publishes neither — it is version control only.

## Decision rule

- Changed only `packages/vscode-extension/*` → **extension release** (no npm publish).
- Changed `src/`, `server/`, `scripts/`, or `config.js` → **engine release**, then an
  **extension release** to bump `engineVersion` so installed extensions pick it up.
- Docs/plans only → just commit.

## Order matters

Always **npm publish the engine before uploading the extension** that pins it —
otherwise fresh installs 404 trying to fetch a nonexistent engine version.
`release-extension.js` enforces this check.

## Never reuse a version number

One version = one binary, forever — even for local-only rebuilds. If you change
a single line after packaging, bump the version before repackaging. VS Code only
offers an update when the Marketplace version is **strictly greater** than the
installed one, so a fixed build re-labeled with an already-shipped version is
invisible to every existing install, and the Marketplace refuses re-uploads of
the same version anyway. (Learned 2026-07-02: two different 0.0.5 builds existed;
the unfixed one reached the Marketplace, so the fix had to ship as 0.0.6.)
`release-engine.js` refuses versions that are already on npm.

## Clean-machine smoke gate (recommended for engine releases)

Catches native-dep leaks that repo-local tests hide: `npm pack packages/md-render`
after staging, `npm install` the tarball into a folder OUTSIDE the repo with
`--omit=optional`, then run `scripts/collect.js` + `server/server.js` from the
installed package (`DOCS_PROFILE=lite`, `DOCS_BACKEND=json`,
`MICROWEBSTACKS_WORKSPACE_ROOT=<scratch docs folder>`) and check pages return 200.

## Build environment caveat

The repo `.env` pins `DOCS_PROFILE=full` and OVERRIDES the shell env (see
`src/libs/load-env.js`). Lite builds must point `MICROWEBSTACKS_WORKSPACE_ROOT`
at an empty directory so the profile takes effect — `release-engine.js` does
this automatically.

## Marketplace notes

- Renaming `name` in `package.json` changes the extension ID: the upload creates
  a **new** marketplace entry. Unpublish the old one manually from the publisher
  page.
- Existing users receive updates via VS Code auto-update; on next preview start
  the extension installs the pinned engine into a fresh `engine-<version>` folder
  and cleans old ones up best-effort.
- README images must be absolute URLs reachable on `main` (vsce's relative-link
  rewrite drops the `repository.directory` prefix and would break them).

## Git

Commit and push independently of the above (GitHub is not part of either publish
pipeline). Keep the repo in sync with what was published: commit before staging,
and tag or note the engine version in the commit message when publishing.
