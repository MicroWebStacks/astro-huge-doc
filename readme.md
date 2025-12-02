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
- Run `pnpm collect` to parse the `.content` directory Markdown and referenced assets and store them in `.structure/structure.db`

# Notes
* XLSX files support dropped but could potentially generate two assets, original file for download and asset table for direct asset vieweing
