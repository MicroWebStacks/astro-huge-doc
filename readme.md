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
- only content is stored on db and versionned
- astro related code is only git managed
- astro generated handler and assets are not managed

### caching
- Multi levels cache from cloud to server disk to memory
- html is cached during warming up for specific versions
- non html cached versions can still stream on demand

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
