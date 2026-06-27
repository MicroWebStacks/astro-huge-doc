# About
Scale doc up to huge amounts, virtually no more limits. Parses multi markdown repos and manages them as db content for cached rendering.

True content based ISR (Incremental Static Regenration) with cache warmup.

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
## fetching
- Configure `fetch.github` in `manifest.yaml` (single object or list). Example:
  ```yaml
  fetch:
    github:
      - repo: MicroWebStacks/astro-big-doc
        branch: main
        folders: [content]
        dest: content
  ```
- `folders` pulls those subfolders and flattens their contents into `dest`; omit `folders` to copy the whole repo. `dest` defaults to the repo name and is cleared before copying.
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
