# Test notes — extension performance

## Benchmark baseline (2026-07-13)

Environment: Windows 11 laptop, Node 22 (repo-required), warm filesystem
cache, no Kroki server running (not needed — mermaid-only content).

Commands run:

```powershell
pnpm bench:lite -- --pages 200
pnpm bench:lite -- --pages 1000
pnpm bench:lite -- --pages 5000
```

(equivalently `node scripts/bench-lite.js --pages N`; `--fresh` regenerates
the synthetic site)

Machine-readable results:

```json
{"pages":200,"fileCount":223,"walkMs":5,"collectMs":2007,"diagramsMs":109,"datasetBytes":3491626,"loadMs":46,"sourceMs":0,"entryMs":0,"heapMB":8.7,"totalMs":2163}
{"pages":1000,"fileCount":1111,"walkMs":9,"collectMs":7538,"diagramsMs":219,"datasetBytes":17455981,"loadMs":146,"sourceMs":2,"entryMs":1,"heapMB":38.9,"totalMs":7904}
{"pages":5000,"fileCount":5511,"walkMs":92,"collectMs":46832,"diagramsMs":665,"datasetBytes":87515096,"loadMs":504,"sourceMs":3,"entryMs":1,"heapMB":176.4,"totalMs":48000}
```

Expected vs actual: expectation from code inspection was "startup scales with
total site size"; actual results confirm and show superlinear collect scaling
(~7.5 ms/page at 1000 pages → ~9.4 ms/page at 5000).

Gaps at baseline (closed or qualified by the final verification below):

- SSR first-page render timing had not yet been captured (OP-006).
- Single machine, warm cache; absolute numbers indicative only, scaling shape
  is the result.
- Synthetic pages carry no image/binary assets, so blob-store costs
  (hash+copy per asset, `rm -rf blobs` on every collect) are underrepresented;
  asset-heavy sites will be worse.

Also run at baseline: `pnpm check:plans` after registering the packet and
`pnpm test` to confirm the `utils.js` optional-chaining change broke nothing.

## Phase 3 verification — content-structure adoption (2026-07-13)

- Parity by construction: `diff -r` of `src/`, `index.js`, `catalog.yaml`,
  `cli.js` between `packages/content-structure/` and the previously consumed
  npm copy (`node_modules/.pnpm/content-structure@2.2.4/...`) — **no
  differences**.
- `node_modules/content-structure` realpath resolves to
  `packages/content-structure` after `pnpm install` (workspace link active).
- `pnpm test` — 10/10 pass.
- `pnpm bench:lite -- --pages 200` — full pipeline through the adopted
  package:
  `{"pages":200,"fileCount":223,"walkMs":3,"collectMs":2246,"diagramsMs":126,"datasetBytes":3491626,"loadMs":49,"sourceMs":0,"entryMs":0,"heapMB":8.7,"totalMs":2421}`
  (consistent with baseline; dataset byte-count identical).
- `pnpm check:plans` — green.

This earlier gap is closed by the final Phase 4/5 verification below.

## Phase 4/5 final verification — lazy core, menu, and release path (2026-07-13)

Final 5000-page reference command:

```powershell
pnpm bench:lite -- --pages 5000
```

```json
{"mode":"lazy","pages":5000,"fileCount":5511,"bareWalkMs":44,"walkMs":181,"sourceMs":2,"coldEntryMs":835,"warmEntryMs":0,"freshProcessMs":176,"ssrFirstPageMs":1249,"ssrFirstPageBytes":88331,"relativeLinkResolved":true,"navigationMs":20,"navigationRoots":1,"heapMB":32.1,"totalMs":1015}
```

Compared with the eager baseline at the same size (48,000 ms total), startup
is now bounded by a 181 ms file-level walk plus one 835 ms requested-page
parse. The built cold HTTP response completed in 1249 ms. The separate menu
request reused `filetree.json`, returned one active-section root in 20 ms, and
did not repeat the workspace walk. These are reference values, not budgets.

Other verification:

- `pnpm test` — 12/12 pass, including active-section-only and home
  loose-root-file navigation tests.
- `pnpm build` — pass against the final source. Expected existing warnings:
  dynamic-route `getStaticPaths()` ignored, empty lite model-viewer chunks,
  and large client diagram chunks.
- `pnpm bench:lite -- --pages 200 --eager` — lazy path and cold HTTP request
  pass; relative `.md` link assertion passes; eager `collect.js` +
  `diagrams.js` pass and emit the unchanged 3,491,626-byte dataset.
- `pnpm ext:stage-engine` — pass against the final build; 606 production
  packages vendored and private `content-structure@2.2.4` present under
  `_modules/content-structure`; built lazy chunk retains runtime imports.
- `pnpm check:plans` — run after atomic packet closure/index edit.

Remaining validation gap: the in-app browser surface was unavailable in this
session, so there is no screenshot-backed click-through of the skeleton and
expand/depth controls. The built HTTP page, link rewrite, navigation endpoint,
tree shape, client/server syntax, and production bundle were verified; a real
VS Code visual smoke remains useful release QA, but implementation is complete
and the workflow does not keep a packet open for later testing alone.

## Repeated 200/1000/5000-page comparison (2026-07-13)

Commands were run sequentially against the same synthetic sites and final
production build, with warm filesystem cache:

```powershell
pnpm bench:lite -- --pages 200
pnpm bench:lite -- --pages 1000
pnpm bench:lite -- --pages 5000
```

Machine-readable after results:

```json
{"mode":"lazy","pages":200,"fileCount":223,"bareWalkMs":6,"walkMs":49,"sourceMs":0,"coldEntryMs":980,"warmEntryMs":1,"freshProcessMs":74,"ssrFirstPageMs":1442,"ssrFirstPageBytes":87499,"relativeLinkResolved":true,"navigationMs":15,"navigationRoots":1,"heapMB":48.3,"totalMs":1029}
{"mode":"lazy","pages":1000,"fileCount":1111,"bareWalkMs":16,"walkMs":92,"sourceMs":1,"coldEntryMs":1285,"warmEntryMs":1,"freshProcessMs":129,"ssrFirstPageMs":1980,"ssrFirstPageBytes":88331,"relativeLinkResolved":true,"navigationMs":11,"navigationRoots":1,"heapMB":42.7,"totalMs":1376}
{"mode":"lazy","pages":5000,"fileCount":5511,"bareWalkMs":77,"walkMs":289,"sourceMs":3,"coldEntryMs":1290,"warmEntryMs":1,"freshProcessMs":304,"ssrFirstPageMs":1765,"ssrFirstPageBytes":88331,"relativeLinkResolved":true,"navigationMs":25,"navigationRoots":1,"heapMB":32.1,"totalMs":1579}
```

The detailed before and after tables plus the direct startup comparison are
kept side by side in `plan.md` under **Measurements**. The latest repeat shows
the intended scaling change: the old total rose from 2.16 s to 48.0 s as the
site grew 25×, while the lazy total rose only from 1.03 s to 1.58 s.
