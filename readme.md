# astro-huge-doc

**Markdown in, documentation site out — at any scale, anywhere you need it.**

`astro-huge-doc` is the MicroWebStacks rendering engine that turns one or many
Markdown repositories into a polished documentation website: code highlighting,
Mermaid / PlantUML diagrams, image galleries, sortable tables, math, file-tree
navigation and per-page TOC — with virtually no limit on content size. Content
is parsed once into a database and rendered from there, so tens of thousands of
pages behave like ten.

One engine, exactly three use cases:

| Use case | Profile + backend + output | What you get |
|---|---|---|
| 🧩 **VS Code extension** | `lite` + JSON + SSR | Live preview of your workspace docs, pages rendered on demand as you browse — no Node, Java or Docker install required |
| 📦 **Static site (GitHub Pages)** | `full` + JSON + static | A fully pre-rendered website you can host anywhere plain files go; built locally or in CI via the bundled GitHub Action |
| 🖥️ **Self-hosted Node SSR** | `full` + SQLite + SSR | The reference implementation of full capability: on-demand rendering and streaming, versioning, blob store, multi-level caching, content-aware ETags |

```mermaid
flowchart LR
    A[Markdown repos<br/>local folders or GitHub] --> B[astro-huge-doc<br/>engine]
    B --> C[🧩 VS Code extension<br/>lite + json + SSR preview]
    B --> D[📦 Static export<br/>full + json + static]
    D --> D2[⚙️ GitHub Action<br/>deploys it to Pages]
    B --> E[🖥️ Node SSR server<br/>full + sqlite, render + cache on demand]
```

The GitHub Action is not a fourth engine home — it is the static build
packaged for CI (see `specification/reusable-render/spec.md`). The full
SQLite SSR server is the reference implementation of the engine's complete
feature set and is always maintained as such.

## Free, open source, and yours alone

astro-huge-doc is free, MIT-licensed open source — and it runs entirely on
your machines. **Zero telemetry, zero data collection, zero phone-home**: not
in the engine, not in the VS Code extension, not in the GitHub Action. Your
content, your builds, and even your performance logs stay with you; what you
document is nobody's business but yours. Performance is measured with a local
benchmark (`pnpm bench:lite`) and local logs — never by watching users.

## SSR and static — pick per deployment, not per project

- **SSR** renders each page the moment it is requested, then caches it — true
  content-based ISR (Incremental Static Regeneration) with cache warmup. This
  is what the VS Code extension uses: pages are rendered lightweight and on
  demand as you browse.
- **Static** pre-renders the entire site into plain files. Push them to GitHub
  Pages (or any static host) and you have a complete documentation website with
  no dedicated server running anywhere.

## Lite and full — one codebase, two profiles

| Profile | Backend | Built for |
|---|---|---|
| **lite** | JSON files | Running inside the VS Code extension: zero native dependencies, Mermaid and PlantUML rendered in the browser |
| **full** | SQLite (canonical) or JSON (static export) | Scaling to huge websites: versioning, blob store, image optimization, GitHub fetch |

Same code, no fork — a runtime switch selects the profile. Everything about
*rendering* is shared; the full profile adds *generation and storage* on top.
Profile, backend, and output are three independent axes; the three use cases
above are the supported combinations (see
`specification/engine-profiles/spec.md`).

# Feature coverage

| Capability | Full (website) | Lite (extension engine) | Mechanism |
|---|---|---|---|
| Standard Markdown (headings, paragraphs, links, lists) | ✅ | ✅ | shared `structure-db` + components |
| Code highlighting (shiki) | ✅ | ✅ | shared |
| Diagrams (mermaid, plantuml, blockdiag) | ✅ | ✅ | Mermaid/PlantUML client-side; BlockDiag and explicitly routed languages via Kroki |
| File-tree + TOC viewer | ✅ | ✅ | shared layout components |
| Markdown tables | ✅ | ✅ | `@tanstack/react-table` (only surviving react-table) |
| Images in Markdown | ✅ optimized | ✅ passthrough | Astro image service swap (sharp in full, passthrough in lite) |
| Gallery (PhotoSwipe) | ✅ | ✅ | dimensions baked into JSON / probed |
| Content-addressed static assets `/blobs/<hash>.<ext>` | ✅ | ✅ | immutable cache + ETag/304, both profiles |
| Data backend | SQLite (+ versioning, blob store) | JSON files | `DOCS_BACKEND` dispatcher (`src/libs/structure-db.js`) |
| 3D / model-viewer | ✅ | ❌ | profile-gated island (stubbed out of the lite build) |
| xlsx ingestion | ✅ | ❌ | collect-time only |
| Image optimization (sharp) | ⚠️ optional | ❌ | full-only |
| GitHub fetch / auth (octokit, passport) | ✅ | ❌ | server-only, full |
| Native deps (better-sqlite3, sharp) | better-sqlite3 only | ❌ none | dynamic import + `EXCLUDED_DEPS` |

**Dropped from both profiles:** Dataset SQL (duckdb) and Plotly charts, plus the
MUI and Mantine UI kits that rode on them. May return later as full-only features.

Anything that is *generation* (collect, xlsx) is full-only; *rendering* is shared.
The lite build loads no native dependencies. In the extension it is fully lazy:
startup walks the file tree only (labels and URLs derive from filenames — see
`specification/engine-profiles/spec.md`), each page is parsed the first time it
is viewed and cached by content hash, and an edit re-parses just that page with
the server kept alive. The static export instead reads a pre-collected
`content.json` plus a `blobs/` folder. In both, images use Astro's passthrough
image service, and `model-viewer` is aliased to an empty stub (dropping its
~980 kB chunk — the lite `dist/client` is ~634 kB).

# Specification
## overview
- list of github repo and folders to fetch
- content is parsed and stored on sqlite db and blobs folder
- db and blobs can are mirrored on cloud (Iceberg + Bucket)
- content is versioned with viewable history
- content is rendered on demand with an Astro SSR handler
- rendered pages are streamed and cached with content sensitive ETag

## details

### versionning
- db manages versionning for documents and assets
- astro and server code are separately git managed
- astro handler has framework managed assets (css and js) and custom assets endpoint

### caching
- Multi levels cache from cloud to server disk to memory
- on demand html can be streamed and cached
- warming up can ensure cache filling

cache libraries considerations :

- lru-cache: simple, in-memory LRU with TTL.
- cacache: content-addressable disk cache; storing bodies keyed by hash.
- apicache (with a storage adapter) or express-cache-middleware if you want a plug-and-play layer, but hand-rolling with lru-cache gives more control.

### pages rendering
- all pages content is stored as db items with pages ids
- astro renders pages on the server with React/Astro and streams html
- interactive islands will be hydrated on the client with the shipped page js assets

# Usage
## configuration

The engine can be configured from four places:

| Source | Applies to | What it controls |
|---|---|---|
| `manifest.yaml` | standalone repo flow and VS Code preview | durable project config such as content paths, collect settings, server defaults, and diagram defaults |
| root `.env` | standalone repo flow and VS Code preview | machine- or workspace-local overrides without editing `manifest.yaml` |
| shell / process env | standalone repo flow and VS Code preview | one-off overrides for the current process |
| VS Code extension settings | VS Code preview only | how the extension finds the engine and what runtime values it injects into the preview |

Start by copying the example file:

```powershell
copy .env.example .env
```

### override order

`config.js` imports `src/libs/load-env.js` first, so environment resolution
happens before the manifest/default config is finalized.

| Context | Highest precedence | Then | Then | Then | Lowest precedence |
|---|---|---|---|---|---|
| standalone repo commands (`pnpm dev`, `pnpm collect`, `pnpm diagrams`, `pnpm server`) | root `.env` | shell / global env | `manifest.yaml` | built-in defaults | - |
| VS Code extension preview | explicit extension runtime env | inherited launcher env | workspace root `.env` | workspace `manifest.yaml` | built-in defaults |

Notes:

- In standalone use, `.env` wins because `dotenv.config({override: true})` is
  the default behavior in `src/libs/load-env.js`.
- In VS Code preview, the extension sets
  `MICROWEBSTACKS_DOTENV_OVERRIDE=false`, so the workspace `.env` fills gaps but
  cannot replace runtime-critical values that the extension already injected.
- `DOCS_BACKEND` defaults from `DOCS_PROFILE` when unset: `lite -> json`,
  otherwise `sqlite`.
- Relative env paths resolve from the workspace root, except
  `MICROWEBSTACKS_OUTDIR`, which resolves from the engine root.

### VS Code extension settings

These settings live under the `microwebstacks.preview.*` namespace in VS Code.

| Setting | Used by | Effect |
|---|---|---|
| `microwebstacks.preview.engineSource` | extension only | chooses where the rendering engine comes from: local checkout, bundled VSIX engine, installed package, or npm registry |
| `microwebstacks.preview.enginePath` | extension only | explicit path to an `astro-huge-doc` checkout; highest-priority engine source |
| `microwebstacks.preview.docsRoot` | extension, then engine | overrides the documentation root inside the opened workspace; when set, the extension passes it to the engine as `MICROWEBSTACKS_DOCS_ROOT`; when unset, the engine uses `manifest.render.folder` when present, otherwise `manifest.output.content`, otherwise the workspace root |
| `microwebstacks.preview.krokiServer` | extension, then engine | if non-empty, the extension passes it as `MICROWEBSTACKS_KROKI_SERVER`; this wins over the workspace `.env` during preview |

`engineSource` and `enginePath` are extension-only settings; they do not map to
engine env vars. `docsRoot` and `krokiServer` affect the engine by being
translated into runtime env vars by the extension.

### environment variables

User-facing env vars:

| Variable | Purpose | Typical values | Notes |
|---|---|---|---|
| `DOCS_PROFILE` | selects runtime profile | `full`, `lite` | `full` = standalone website/warehouse, `lite` = VS Code extension engine |
| `DOCS_BACKEND` | selects data backend | `sqlite`, `json` | if unset, derived from `DOCS_PROFILE` |
| `MICROWEBSTACKS_KROKI_SERVER` | Kroki rendering endpoint | `http://localhost:18000`, `https://kroki.io`, internal URL | used by BlockDiag and languages explicitly routed to `kroki`; Mermaid and default PlantUML stay local |
| `MICROWEBSTACKS_HOST` | server bind host | `127.0.0.1`, `0.0.0.0` | env wins over `manifest.yaml` |
| `MICROWEBSTACKS_PORT` | server bind port | `4321` | env wins over `manifest.yaml` |
| `MICROWEBSTACKS_PROTOCOL` | advertised protocol | `http`, `https` | env wins over `manifest.yaml` |
| `MICROWEBSTACKS_DOCS_ROOT` | Markdown content root | `content`, `demo`, `docs`, `.` | relative to workspace root; overrides `manifest.render.folder` / `output.content` |
| `MICROWEBSTACKS_DB_PATH` | SQLite database path | `dataset/content.db` | mainly for the full/sqlite flow; relative to workspace root |
| `MICROWEBSTACKS_STORE_PATH` | dataset/blob store path | `dataset` | relative to workspace root |
| `MICROWEBSTACKS_JSON_DIR` | JSON export directory | `dataset/json` | relative to workspace root; used by the json backend |
| `MICROWEBSTACKS_OUTDIR` | Astro SSR output directory | `dist` | relative to engine root, not workspace root |
| `GITHUB_TOKEN` | authenticated GitHub fetch access | personal access token | used by `scripts/fetch.js`; keep this in `.env` only |

Advanced or runtime-injected env vars:

| Variable | Usually set by | Purpose |
|---|---|---|
| `MICROWEBSTACKS_WORKSPACE_ROOT` | extension or advanced shell usage | anchors `.env`, content paths, and manifest discovery |
| `MICROWEBSTACKS_ENGINE_ROOT` | extension or advanced shell usage | points at the engine checkout/install root |
| `MICROWEBSTACKS_MANIFEST_PATH` | extension or advanced shell usage | explicit manifest location instead of `<workspace>/manifest.yaml` |
| `MICROWEBSTACKS_EXTENSION_MODE` | extension or standalone lite/native usage | `true` suppresses the standalone "Authentication is disabled" banner; the real VS Code extension sets this automatically |
| `MICROWEBSTACKS_DOTENV_OVERRIDE` | extension or advanced shell usage | `false` means `.env` fills missing keys only; any other value keeps `.env` override behavior |
| `MICROWEBSTACKS_DEBUG_CONFIG` | ad hoc debugging | prints resolved config for inspection |
| `MICROWEBSTACKS_NODE_PATH` | extension launch environment | optional override for the Node executable the extension uses |

## diagram rendering

Mermaid and PlantUML render client-side in the browser and VS Code preview.
They require no Java, Docker, or external diagram server. PlantUML uses the
official `@plantuml/core` browser engine and loads it only on pages containing
PlantUML diagrams.

BlockDiag and other languages routed to `kroki` use
`MICROWEBSTACKS_KROKI_SERVER`. Set it through `.env`, the shell, or the VS Code
setting `microwebstacks.preview.krokiServer` when those diagrams are present.
PlantUML can be routed back to Kroki as a compatibility fallback:

```yaml
diagram:
  languages:
    plantuml: kroki
```

Client PlantUML cannot automatically read arbitrary local `!include` files,
and the npm engine omits large optional sprite bundles. Use the explicit Kroki
route when affected content is not compatible with client mode.

### local Docker Kroki

Use this for BlockDiag or explicitly Kroki-routed diagrams without sending
diagram source to an external service:

```dotenv
MICROWEBSTACKS_KROKI_SERVER=http://localhost:18000
```

Start the local renderer:

```powershell
pnpm kroki:up
# equivalent to: docker compose up -d
```

Then run one of the normal preview flows:

```powershell
pnpm dev
```

or regenerate the data explicitly:

```powershell
pnpm collect
pnpm diagrams
pnpm dev
```

To force a fresh diagram render before testing, clear generated diagram rows
and static SVG blobs first:

```powershell
pnpm clean:diagrams
pnpm diagrams
pnpm dev
```

For the lite/JSON profile, a fresh collect already recreates
`dataset/json/content.json` and `dataset/json/blobs`. To explicitly test
diagram rendering from a clean JSON dataset:

```powershell
$env:DOCS_BACKEND="json"
pnpm collect
pnpm clean:diagrams
pnpm diagrams
pnpm dev
```

After `pnpm clean:diagrams`, the next `pnpm diagrams` run calls the configured
Kroki URL again only for Kroki-routed diagrams. Client Mermaid and PlantUML are
skipped by the collection renderer.

Rendered diagram SVG files are served from `/blobs/<12-hex>.svg`; the full
content hash remains in the dataset metadata.

When you are done with the local renderer:

```powershell
pnpm kroki:down
# equivalent to: docker compose down
```

### public Kroki

Use the public service only when it is acceptable to send diagram source to
`kroki.io`:

```dotenv
MICROWEBSTACKS_KROKI_SERVER=https://kroki.io
```

Then run:

```powershell
pnpm collect
pnpm diagrams
pnpm dev
```

### custom or internal Kroki

For a company-hosted or otherwise custom Kroki-compatible endpoint, set the
same variable to the internal base URL:

```dotenv
MICROWEBSTACKS_KROKI_SERVER=https://kroki.example.internal
```

Then run the same commands:

```powershell
pnpm collect
pnpm diagrams
pnpm dev
```

## fetching
- Configure `fetch.github` in `manifest.yaml` (single object or list). Use
  `fetch.select` to run one repo from a list of examples, or omit it/use `all`
  to fetch every entry. Example:
  ```yaml
  fetch:
    select: MicroWebStacks/astro-big-doc
    github:
      - repo: MicroWebStacks/astro-big-doc
        branch: main
        folders: [content]
        dest: content
      - repo: VectorMind/alm-ontology
        branch: main
        dest: content
  output:
    content: content
  render:
    folder: demo
  ```
- `folders` pulls those subfolders and flattens their contents into `dest`; omit `folders` to copy the whole repo. `dest` defaults to the repo name and is cleared before copying.
- `output.content` remains the fetch destination / legacy default docs root. Set `render.folder` when you want to render a different folder such as a bundled local `demo/` tree while still fetching remote content into `content/`.
- Switch examples by changing `fetch.select` to another `repo` value.
- Set `GITHUB_TOKEN` to avoid GitHub rate limits.
- Run `pnpm fetch` (or `node scripts/fetch.js`) after installing dependencies.

## collection
- All configs are optional and have defaults
- Configure `collect` in `manifest.yaml`. Example:
    ```yaml
    collect:
    folder_single_doc: false
    file_link_ext: ["svg","webp","png","jpeg","jpg","xlsx","glb"]
    file_compress_ext: ['txt','md','json','csv','tsv','yaml','yml']
    external_storage_kb: 512
    inline_compression_kb: 32
    ```
    - `folder_single_doc` default is false for one document per file, when true, generates one document per folder merging its markdown files.
    - `file_link_ext` : only these extensions will be considered as assets to manage
    - `file_compress_ext` : files subject to compressions in blobs storage
    - `external_storage_kb` : threshold to manage blobs in folders and not in db
    - `inline_compression_kb` : threshold above which db blobs get compressed
- Run `pnpm collect` to parse the `content` directory Markdown and referenced assets and store them in `dataset/content.db`

## GitHub Action

The repository root doubles as a composite GitHub Action that renders a
consumer's Markdown workspace into a static site artifact, ready for
`actions/upload-pages-artifact` + `actions/deploy-pages`:

```yaml
- name: Render static site
  uses: MicroWebStacks/astro-huge-doc@<pinned-tag-or-sha>
  with:
    engine-version: '<exact @microwebstacks/md-render version>'
    workspace: '.'
    out-dir: 'dist'
    base: '/my-repo/'
```

See [action.yml](action.yml) for all inputs and
[.github/workflows/render-example.yml](.github/workflows/render-example.yml)
for a complete reference workflow including the Pages deploy jobs.

## VS Code desktop extension

The repository includes a first-pass desktop VS Code extension in
`packages/vscode-extension`. It previews Markdown documentation from the opened
workspace through the existing `astro-huge-doc` SSR renderer and opens the same
localhost preview in an external browser on demand.

Configuration for extension mode is documented in `Usage -> configuration`.
This section covers install and run only.

The extension follows VS Code storage conventions:

- Markdown, MDX, assets, and optional `manifest.yaml` are read from the opened
  workspace.
- Generated preview databases and cache files are stored in VS Code
  workspace-scoped extension storage, not in the workspace and not in the
  installed extension directory.
- The standalone repo flow still works with `manifest.yaml`, `pnpm collect`,
  `pnpm build`, and `pnpm server`.

### Prepare the local rendering engine

From this repository:

```powershell
pnpm install
pnpm build
```

The extension expects the Astro SSR build at `dist/server/entry.mjs`.

### Test without publishing

You do not need to publish the extension to test it against another workspace.
Launch an Extension Development Host and point it at the Markdown workspace:

```powershell
code --extensionDevelopmentPath C:\dev\MicroWebStacks\astro-huge-doc\packages\vscode-extension C:\path\to\docs-workspace
```

In the Extension Development Host window, run:

```txt
MicroWebStacks: Preview Docs in VS Code
```

Additional commands:

```txt
MicroWebStacks: Open Docs in Browser
MicroWebStacks: Restart Docs Preview Server
MicroWebStacks: Stop Docs Preview Server
```

### Install from a local VSIX

For local installation without Marketplace publishing, build/package the
extension and install the generated `.vsix`:

```powershell
pnpm ext:release
code --install-extension .\packages\vscode-extension\markdown-site-preview.vsix
```

The installed extension normally does not require system Node/npm: in `auto`
mode it uses the bundled lite/json engine shipped inside the VSIX and uses VS
Code's bundled runtime to run it. The pinned published
`@microwebstacks/md-render` package remains available as a fallback or when you
explicitly force `microwebstacks.preview.engineSource=registry`.
`microwebstacks.preview.enginePath` is now only an advanced development
override when you want the extension to run against a local checkout instead of
the bundled or published engine.

# Notes
* XLSX files support dropped but could potentially generate two assets, original file for download and asset table for direct asset vieweing
