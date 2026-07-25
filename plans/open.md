# Open Plans

Plan packets with work still outstanding. See each folder for details.

| Plan | Date | Status | Summary |
| --- | --- | --- | --- |
| [2026-07-25-homesmartmesh-parity](2026-07/25/homesmartmesh-parity/) | 2026-07-25 | Phase 0/5 done | Publishing the HomeSmartMesh content set as a static GitHub Pages site at parity with <https://homesmartmesh.github.io/>. **Phase 0 complete**: one shared fenced-block classifier replaces the collector/renderer predicates that disagreed over `yaml gallery_dir`, the renderer degrades any custom-yaml block whose data is missing to a highlighted code block instead of throwing, and the sharp `.ico` warning is gone — full static build 115 pages and lite 76 pages, both exit 0, 86/86 tests. Galleries render identically in both profiles, `gallery_dir` included (`R-5`: Phase 0 removes no capability that already worked). Phases 1-5 revised against the working build (round-2 rulings `R-6`..`R-11`): identity is the slugified filename in every profile with frontmatter slugs ignored, url/uid compatibility is deliberately broken and the content gets reworked instead, chrome collapses rather than disappears, and asset paths resolve against the content root. One decision open — `OP-005` asset duplication, measured at 349.8 MB with Option A (ship nothing unreferenced) recommended for ~241 MB. |
