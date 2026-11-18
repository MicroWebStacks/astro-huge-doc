# Handoff response: responsive image previews

Prepared 2026-11-18 for the HomeSmartMesh workspace maintainer.

## What happened

The original [handoff](handoff.md) was moved into this dated packet, checked
against the current renderer, and turned into an implementation. The work is
complete locally; see [implementation.md](implementation.md) and
[test.md](test.md). Nothing has been released, pushed or deployed by this work.

Cards and galleries now use responsive WebP previews. Full collection generates
them automatically after writing source blobs. Astro renders their URLs and
copies them into static output. Original images remain available for PhotoSwipe
and downloads. Ordinary Markdown/Panzoom images are unchanged in this delivery.

Defaults are widths 320/640/1280, WebP quality 75, automatic EXIF orientation and
no upscaling. Small images receive a candidate at their actual width. SVG and
animated images retain originals. Unsupported inputs and generation failures
fall back to originals; failures produce an aggregate warning. Most previews
load lazily; the first card image is eager. Lite/VS Code keeps original-image
fallback without requiring native image processing.

## Which HomeSmartMesh renderer this concerns

Two different states were found during investigation:

| Location inspected | State observed |
| --- | --- |
| Local `C:\dev\HomeSmartMesh\homesmartmesh.github.io` | Stale `main` checkout at `7ee076a`, containing its own Astro 4 project, `withastro/action@v2`, Node 20 and an old `pnpm build` script. |
| Remote HomeSmartMesh `main` workflow | Content-workspace publishing through `MicroWebStacks/astro-huge-doc@fc0d7d2314abcb46830708dde46de9b0d90049db`, installing `@microwebstacks/md-render@0.0.24` on Node 24 and publishing full/json/static output. |

Remote workflow inspected during this task:
<https://github.com/HomeSmartMesh/homesmartmesh.github.io/blob/main/.github/workflows/deploy.yml>.
The latest successful deployment run was not inspected, so this identifies the
configured publication path rather than proving the exact currently served commit.

Before adoption, reconcile the local HomeSmartMesh checkout with the migrated
content workspace on remote `main`, preserving any local work. Its old Astro
`pnpm build` command does not invoke this new renderer. No Git history or
checkout changes were made as part of this packet.

## Try the implementation now, before a release

Use Node 22 or newer (Node 24 matches the consumer workflow). The renderer source
checkout must have its workspace dependencies installed, including Sharp; its
normal setup command is `pnpm install --frozen-lockfile` in `astro-huge-doc`.

From the updated HomeSmartMesh workspace, run the source engine directly:

```powershell
Set-Location 'C:\dev\HomeSmartMesh\homesmartmesh.github.io'
node 'C:\dev\MicroWebStacks\astro-huge-doc\bin\md-render.js' preview . --docs-root content
```

This builds the full static site, starts a local server and opens the browser.
It is a one-shot build, not a file watcher: rerun after editing content. Stop
with Ctrl+C; its temporary build directory is cleaned up. Add `--keep` if you
want to retain the artifact; the command reports its location.

To write a persistent static artifact instead:

```powershell
node 'C:\dev\MicroWebStacks\astro-huge-doc\bin\md-render.js' build --workspace . --out-dir dist --site 'https://homesmartmesh.github.io/'
```

Build uses the workspace manifest's content directory, or its conventional
`content/` directory when no content root is declared. Output is written to the
generated `dist/` directory. No separate collect, image-generation or Astro
command is required for either CLI command. The renderer reads this workspace;
it does not fetch the renderer repository's manifest content.

## Where the files go

For CLI build/preview and the GitHub Action:

```text
HomeSmartMesh content originals (unchanged)
  -> temporary build store
       json/blobs/<original-hash>.<ext>
       image-previews/index.json
       image-previews/<transform-hash>.webp
  -> static artifact
       index.html and other pages
       blobs/<original-hash>.<ext>
       image-previews/<transform-hash>.webp
```

The preview index is internal and is not copied into the published artifact.
The CLI's temporary store is discarded after build/normal preview cleanup.
`build` leaves the static artifact in HomeSmartMesh's `dist/`. Generated files
are not committed to either repository.

For a source-framework workflow that runs `pnpm collect` against a retained
store, previews live under `<resolved-store>/image-previews/`, normally
`dataset/image-previews/`. Existing valid previews there are reused. CLI/Action
builds start with isolated temporary stores, so separate runs initially
regenerate their previews from scratch. Cross-run GitHub caching is deferred.

The complete pipeline is:

```text
collect content + source blobs
  -> prepare image previews (part of full collect)
  -> prepare diagrams
  -> Astro static build + copy originals/previews
  -> upload dist
  -> GitHub Pages deployment
```

## Enable it in HomeSmartMesh's GitHub Action

The current consumer pin `0.0.24` does not acquire unpublished local changes.
The temporary verification package used the same version label only for testing;
it was not published and does not change the existing registry release.

Adoption requires these follow-up steps:

1. Release a new `@microwebstacks/md-render` version containing this work using
   the repository's existing release workflow. Select a new version; none was
   reserved or published here.
2. In HomeSmartMesh's `.github/workflows/deploy.yml`, change `engine-version`
   to that exact released version. The existing Action wrapper already installs
   optional dependencies; changing only its SHA does not upgrade the installed
   engine. The wrapper itself was not changed by this packet.
3. Run the consumer workflow on a review branch to build/upload without
   publishing, using the remote workflow's existing `main` deployment gate.
4. Inspect the log/artifact and test the real 3D Printing page. Then use the
   normal maintainer process to update `main` and publish.

The render step retains this shape; the version below is a placeholder:

```yaml
- name: Render static site
  id: render
  uses: MicroWebStacks/astro-huge-doc@fc0d7d2314abcb46830708dde46de9b0d90049db
  with:
    engine-version: '<new-released-version>'
    node-version: '24'
    workspace: '.'
    out-dir: 'dist'
    site: 'https://homesmartmesh.github.io/'
```

Keep the existing checkout, artifact upload and deploy steps. No runtime image
service is needed on GitHub Pages, and no generated images need committing.
For later local use of the published package, install that exact new engine
version and invoke its `md-render build`/`preview` commands with the same
workspace arguments shown above.

Sharp is an **optional package dependency for full builds**, installed by the
Action's normal npm install. Do not omit optional dependencies for these builds.
The native-free lite vendor bundle omits Sharp. If a full install lacks Sharp,
collection warns and retains originals; a successful build alone is therefore
not proof that optimization occurred.

## Read the compact log

Example only; these are not HomeSmartMesh measurements:

```text
Image previews: 52 source images; 140 generated, 4 regenerated, 12 reused
Image previews: 2 skipped sources, 0 failed sources; originals retained
Image previews: 156 preview files, 2.34 MB total (2340000 bytes); 1.8s
```

- Generated/regenerated/reused counts refer to preview files, not source images.
  A source can produce several widths. Identical transforms are shared.
- Regenerated means a previously indexed variant for the same logical asset
  and width was rebuilt, for example after content/settings changed or a file
  disappeared. Hash-named output is replaced by a new index reference as needed.
- Total size counts current indexed preview files once, including reused files;
  it excludes originals, the index and stale cache files. It is not initial
  browser traffic or the entire website's size.
- A fresh CLI/CI temporary store normally reports generated files with zero
  regenerated/reused. That is expected without a persistent cross-run cache.
- Success output stays at three lines. Failures add one bounded warning line,
  rather than a success message per image.

## Verify adoption and known gaps

In the real HomeSmartMesh artifact/browser, check that cards/gallery images
have `srcset`, candidate URLs under `/image-previews/`, valid intrinsic dimensions
and intended loading attributes. Gallery anchors must still point to original
`/blobs/` images. Scroll and open PhotoSwipe on mobile/desktop; originals should
not be downloaded for gallery previews before interaction. Confirm that failures
are zero and any skips correspond to deliberately unsupported/animated/vector
sources. Missing previews should show originals rather than broken images.

Framework verification completed: unit tests, real image/cache tests, static
CLI build, SQLite SSR build/runtime, lite build/runtime with native imports
blocked, mobile/desktop browser checks, and a packed engine installed into a
fresh npm consumer. The installed consumer generated previews automatically.

The existing static artifact scanner stalled on the large client bundle and
was stopped; no passing result is claimed for that gate. Full HomeSmartMesh
visual/byte-budget and controlled before/after LCP measurements remain to be
run. The original handoff's compression experiment is not a measured production
page-load improvement. Old preview files can accumulate in retained local
stores; pruning and persistent cross-run caching are deferred.

No HomeSmartMesh workflow, package pin or deployment was changed by this work.
