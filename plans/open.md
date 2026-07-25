# Open Plans

Plan packets with work still outstanding. See each folder for details.

| Plan | Date | Status | Summary |
| --- | --- | --- | --- |
| [2026-07-25-homesmartmesh-parity](2026-07/25/homesmartmesh-parity/) | 2026-07-25 | Phase 0/5 done | Publishing the HomeSmartMesh content set as a static GitHub Pages site at parity with <https://homesmartmesh.github.io/>. **Phase 0 complete**: one shared fenced-block classifier replaces the collector/renderer predicates that disagreed over `yaml gallery_dir`, the renderer degrades any unrenderable custom-yaml block to a highlighted code block instead of throwing, gallery expansion became a per-parse opt-out (lite skips it, the dataset export never does), and the sharp `.ico` warning is gone — full static build 115 pages and lite 76 pages, both exit 0, 87/87 tests. Phases 1-5 remain provisional pending the page-by-page re-survey the working build now allows; known scope: 34/73 divergent URLs, 38/45 dangling card uids, missing iframe/glb/xlsx rendering, `/data/**` assets unfetched, `/__lite/**` 404s in static output. |
