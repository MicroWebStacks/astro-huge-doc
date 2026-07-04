# Release guide — who ships what

Three artifacts live in this repo. Knowing which one a change touches tells you
exactly what to release:

| Artifact | Source | Ships as | Ships to |
|---|---|---|---|
| **Engine** (the renderer) | `src/`, `server/`, `scripts/`, `config.js` | `@microwebstacks/md-render` (staged build artifact in `packages/md-render/`, gitignored) | npm registry |
| **Extension** (the thin VS Code launcher) | `packages/vscode-extension/` (`extension.js`, `package.json`, `README.md`) | `markdown-site-preview.vsix` | VS Code Marketplace |
| **Repo** | everything | git commits | GitHub (branch `vscode_lite` → `main`) |

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

## Engine release (`@microwebstacks/md-render`)

```powershell
# 1. Lite build. CAUTION: the repo .env pins DOCS_PROFILE=full and OVERRIDES the
#    shell env. Point the workspace root at an empty dir so lite takes effect:
$env:DOCS_PROFILE='lite'; $env:MICROWEBSTACKS_WORKSPACE_ROOT='C:\temp\empty'
pnpm build

# 2. Stage the package (pick the next engine version):
node scripts/stage-engine.js --version 0.0.3

# 3. Clean-machine smoke gate (catches native-dep leaks that repo-local tests hide):
#    npm pack packages/md-render, npm install the tarball into a folder OUTSIDE the
#    repo with --omit=optional, then run scripts/collect.js + server/server.js from
#    the installed package (DOCS_PROFILE=lite, DOCS_BACKEND=json) against a scratch
#    docs folder and check pages return 200.

# 4. Publish (npm 2FA: login session expires — E404 on PUT means npm login first):
cd packages/md-render
npm login          # only if `npm whoami` fails
npm publish --access public --otp=<fresh-code>
npm view @microwebstacks/md-render version   # confirm
```

Then do an extension release with `engineVersion` set to the new engine version.

## Extension release (Marketplace)

```powershell
# 1. In packages/vscode-extension/package.json:
#    - bump "version" (Marketplace requires strictly increasing)
#    - set "engineVersion" to the npm engine this extension should use

# 2. Package:
cd packages/vscode-extension
npm exec --yes @vscode/vsce -- package --no-dependencies -o markdown-site-preview.vsix

# 3. Test locally before uploading:
code --install-extension markdown-site-preview.vsix --force
#    → reload VS Code window, run "Markdown Site Preview: Open Preview" in a docs folder.

# 4. Upload the .vsix at https://marketplace.visualstudio.com/manage/publishers/microwebstacks
#    (… menu on the extension → Update). Web upload needs no PAT.
#    NOTE: renaming "name" in package.json (e.g. microwebstacks-docs-preview →
#    markdown-site-preview) changes the extension ID: the upload creates a NEW
#    marketplace entry. Unpublish the old one manually from the publisher page.
```

Existing users receive the new extension via VS Code auto-update; on next preview
start it installs the pinned engine into a fresh `engine-<version>` folder and
cleans old ones up best-effort.

## Order matters

Always **npm publish the engine before uploading the extension** that pins it —
otherwise fresh installs 404 trying to fetch a nonexistent engine version.

## Never reuse a version number

One version = one binary, forever — even for local-only rebuilds. If you change
a single line after packaging, bump the version before repackaging. VS Code only
offers an update when the Marketplace version is **strictly greater** than the
installed one, so a fixed build re-labeled with an already-shipped version is
invisible to every existing install, and the Marketplace refuses re-uploads of
the same version anyway. (Learned 2026-07-02: two different 0.0.5 builds existed;
the unfixed one reached the Marketplace, so the fix had to ship as 0.0.6.)

## Git

Commit and push independently of the above (GitHub is not part of either publish
pipeline). Keep the repo in sync with what was published: commit before staging,
and tag or note the engine version in the commit message when publishing.
