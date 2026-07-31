# Interactive neighborhood graph validation

## Automated checks

### Focused renderer model tests

Command:

`node --test test\graph.test.js test\graph-view.test.js test\graph-renderers.test.js test\layout-footer.test.js`

Result: 31 passed, 0 failed.

Coverage includes payload normalization, missing-edge filtering, deterministic
seeding, one-hop adjacency, route-prefix-safe URLs, vis-network node/edge
configuration, circle and label hit activation, click-versus-drag
classification, connected-component depth assignment, the 71-node initial
bound, full-universe generation, the discrete-slider toolbar contract, global
depth filtering and stable counts, independent branch expansion metadata,
hidden-neighbor metadata, automatic global-depth synchronization after local
coverage, and deferred renderer loading.
Regression cases cover an empty lite-profile
`getDocumentsFull()` result and guarantee that expansion retains the currently
visible nodes and edges.

### Full test suite

Command:

`corepack pnpm test`

Result: 192 tests, 191 passed, 0 failed, 1 skipped.

### Production build

Command:

`corepack pnpm build`

Result: passed.

Observed production chunks:

| Chunk | Raw | Gzip |
| --- | ---: | ---: |
| vis-network adapter | 5.24 KB | 2.45 KB |
| vis-network engine | 652.85 KB | 154.84 KB |

The app-bar entry contains a deferred import for the vis-network adapter
rather than an eager engine import. Cytoscape still appears in the production
output solely through Mermaid's existing dependency graph; the neighborhood
graph has no Cytoscape adapter or direct dependency. The build retained
pre-existing warnings about dynamic routes, empty model-viewer chunks, and
other large chunks.

### Full-profile static build

Command:

`MICROWEBSTACKS_DOTENV_OVERRIDE=false DOCS_PROFILE=full DOCS_BACKEND=json DOCS_OUTPUT=static corepack pnpm astro build --config astro.config.static.mjs`

Result: passed; 115 pages built. The generated `/graph/all.json` is 9,388
bytes and contains 73 nodes and 6 resolved directed edges. The local `.env`
otherwise intentionally overrides shell values and selects the extension's
lite profile, so the documented override switch is required for this check.

## Browser validation gap

The in-app browser could not be launched in this environment; only the Chrome
extension transport was available, without a callable connected tab.
Consequently no claim is made yet for live pointer, touch, visual layout, or
responsive browser verification. The renderer has been selected by maintainer
review, but those checks remain required before final rollout.
