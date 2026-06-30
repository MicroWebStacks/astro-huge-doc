# About
Scale doc up to huge amounts, virtually no more limits. Parses multi markdown repos and manages them as db content for cached rendering.

True content based ISR (Incremental Static Regenration) with cache warmup.

# Profiles: lite vs full

One codebase serves two profiles without forking, selected at runtime:

- **full** — the standalone website / warehouse. SQLite backend, versioning,
  blob store, image optimization, GitHub fetch.
- **lite** — the engine shipped inside the VS Code extension. JSON data backend,
  no native dependencies, diagrams rendered by an external Kroki endpoint.

| Switch | full | lite |
|---|---|---|
| `DOCS_PROFILE` | `full` | `lite` |
| `DOCS_BACKEND` | `sqlite` | `json` |

## Feature coverage

| Capability | Full (website) | Lite (extension engine) | Mechanism |
|---|---|---|---|
| Standard Markdown (headings, paragraphs, links, lists) | ✅ | ✅ | shared `structure-db` + components |
| Code highlighting (shiki) | ✅ | ✅ | shared |
| Diagrams (mermaid, plantuml, blockdiag) | ✅ | ✅ | external Kroki endpoint (`MICROWEBSTACKS_KROKI_SERVER`) |
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

Principle: **lite = render what's on disk; full = generate, store, optimize.**
Anything that is *generation* (collect, xlsx) is full-only; *rendering* is shared.
The lite build loads no native dependencies: data comes from a `content.json`
export plus a `blobs/` folder, images use Astro's passthrough image service, and
`model-viewer` is aliased to an empty stub (dropping its ~980 kB chunk — the lite
`dist/client` is ~634 kB).

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
## environment and diagram rendering

The engine reads environment overrides from a root `.env` file before it reads
ambient shell variables, `manifest.yaml`, or built-in defaults. Start by copying
the example file:

```powershell
copy .env.example .env
```

The diagram renderer is configured with:

```dotenv
MICROWEBSTACKS_KROKI_SERVER=http://localhost:18000
```

This URL is where the engine POSTs Mermaid, PlantUML, and BlockDiag source when
`scripts/diagrams.js` runs. No Java renderer runs inside VS Code; the preview
always calls a Kroki-compatible HTTP endpoint.

### local Docker Kroki

Use this for offline/local testing and for VS Code preview without sending
diagram source to an external service:

```dotenv
MICROWEBSTACKS_KROKI_SERVER=http://localhost:18000
```

Start the local renderer:

```powershell
docker compose up -d
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

After `pnpm clean:diagrams`, the next `pnpm diagrams` run must call the
configured Kroki URL again for every diagram.

Rendered diagram SVG files are served from `/blobs/<12-hex>.svg`; the full
content hash remains in the dataset metadata.

When you are done with the local renderer:

```powershell
docker compose down
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

For the VS Code extension, put the `.env` file in the opened documentation
workspace or set the variable in the environment that launches VS Code. Restart
the preview after changing the URL; the extension runs collect and diagram
generation before starting the local preview server.

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
  ```
- `folders` pulls those subfolders and flattens their contents into `dest`; omit `folders` to copy the whole repo. `dest` defaults to the repo name and is cleared before copying.
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

## VS Code desktop extension

The repository includes a first-pass desktop VS Code extension in
`packages/vscode-extension`. It previews Markdown documentation from the opened
workspace through the existing `astro-huge-doc` SSR renderer and opens the same
localhost preview in an external browser on demand.

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

For local installation without marketplace publishing, package the extension
from `packages/vscode-extension` with VS Code's `vsce` tool, then install the
generated `.vsix`:

```powershell
cd C:\dev\MicroWebStacks\astro-huge-doc\packages\vscode-extension
vsce package
code --install-extension .\microwebstacks-docs-preview-0.0.1.vsix
```

For this V1 local package, set the VS Code setting
`microwebstacks.preview.enginePath` to the root of this repository checkout:

```json
{
  "microwebstacks.preview.enginePath": "C:\\dev\\MicroWebStacks\\astro-huge-doc"
}
```

Open another Markdown workspace and run
`MicroWebStacks: Preview Docs in VS Code`.

If the workspace has a `manifest.yaml`, the extension lets the engine use its
configured `output.content` path. For a plain Markdown folder without a
manifest, the workspace folder itself is treated as the docs root. You can
override that with `microwebstacks.preview.docsRoot`.

# Notes
* XLSX files support dropped but could potentially generate two assets, original file for download and asset table for direct asset vieweing
