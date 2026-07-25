# Open Plans

Plan packets with work still outstanding. See each folder for details.

| Plan | Date | Status | Summary |
| --- | --- | --- | --- |
| [2026-07-25-homesmartmesh-parity](2026-07/25/homesmartmesh-parity/) | 2026-07-25 | Phase 1/5 done | Publishing the HomeSmartMesh content set as a static GitHub Pages site at parity with <https://homesmartmesh.github.io/>. **Phases 0-1 complete**: both static targets build, galleries remain intact, and one dependency-free path-only identity rule now drives full collection, lite walking, card UIDs, and document links. It follows OKF/GitHub path identity by preserving URL-unreserved characters and case, normalizing only unsafe runs. All 50 card-reference and 34 document-link rows exposed by the final rule were inspected and migrated on isolated branch `astro-huge-doc-migration` at `2a0385c`; its combined diff has no path renames. A fresh pinned fetch collects 73 documents with zero unresolved-reference diagnostics and the full static build produces 115 pages. The current legacy builder cannot consume the new full-path card UIDs, so mainline remains untouched. The eventual publishing-action cutover happens atomically in the currently publishing repository and is outside this packet. **Paused for maintainer review before Phase 2.** |
