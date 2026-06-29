# Plan — `vscode_lite`: dual data backend, lite/full profiles, dockerized diagrams

Branch: `vscode_lite`. Goal: split the project into two **profiles** sharing one codebase —
a **lite** profile (the VS Code extension engine: standard Markdown + diagrams + the
file-tree/TOC viewer, JSON data, no native deps) and a **full** profile (the local website
/ warehouse: SQLite, dataset SQL, charts, 3D, image optimization). Differentiation is a
**build/runtime profile + a data-backend dispatcher**, never a fork.

> ⚠️ Pre-req: the live `GITHUB_TOKEN` in `.env` was exposed — **rotate it** before anything else.
> `.env` stays gitignored and is the secret store; it never goes into `compose.yaml` or git.

---

## 1. Feature mapping — lite vs full

| Capability | Lite (extension engine) | Full (website / warehouse) | Mechanism |
|---|---|---|---|
| Standard Markdown render (headings, paragraphs, links, lists) | ✅ | ✅ | shared `structure-db` + components |
| Code highlight (shiki) | ✅ | ✅ | shared |
| **Diagrams** — mermaid, plantuml, blockdiag (kroki) | ✅ | ✅ | configurable `kroki` server URL |
| **File-tree + TOC viewer** (the capital feature) | ✅ | ✅ | shared layout components |
| Images in Markdown | ✅ (passthrough) | ✅ (optimized) | Astro image service swap |
| Markdown tables (`@tanstack/react-table`) | ✅ | ✅ | `buildTableNode` + MarkdownTable.jsx — **the only surviving react-table** |
| Gallery (PhotoSwipe) | ✅ (image-size dims) | ✅ | dims baked in JSON / probed — see §2 |
| **Data backend** | **JSON files** | **SQLite (+ versioning, blob store)** | `DOCS_BACKEND` dispatcher |
| **Dataset SQL** (`/pages/tables`, `/api/charts`, `/api/tables`, ServerTable) | ❌ | ❌ **dropped** | duckdb removed entirely — see §2 |
| Plotly charts | ❌ | ❌ **dropped** | experiment; revisit later as a full-only feature |
| 3D / model-viewer | ❌ | ✅ | profile-gated island |
| xlsx ingestion | ❌ | ✅ | collect-time only |
| Image optimization (sharp astro:assets) | ❌ (passthrough) | ⚠️ optional | only if you use astro:assets — see §2 |
| GitHub fetch / auth (octokit, passport) | ❌ | ✅ | server-only, full |
| Native deps (better-sqlite3, duckdb, sharp) | ❌ none | better-sqlite3 only | dynamic import + `EXCLUDED_DEPS` |

Principle: **lite = render what's on disk**; **full = generate, store, optimize**.
Anything that is *generation* (collect, xlsx) is full-only; *rendering* is shared.
**Dataset SQL (duckdb) is dropped from both.** The heavy UI stack collapses to a single
react-table lib (`@tanstack`) — see the cascade in §2.

---

## 2. Dependency drop assessment + UI-stack cascade

### duckdb — DROP FROM BOTH (decided)
- **Only** `src/libs/dataset-sql.js` imports it, consumed **only** by `src/pages/api/charts.js`,
  `src/pages/api/tables.js`, and rendered via `src/pages/tables.astro` → `ServerTable.jsx`.
- Markdown tables do **not** use it (they parse JSON blobs via `buildTableNode`).
- **Removal set (delete all):** `src/libs/dataset-sql.js`, `src/pages/api/charts.js`,
  `src/pages/api/tables.js`, `src/pages/tables.astro`, `src/components/tables/ServerTable.jsx`,
  and `duckdb` from `package.json`.
### Plotly — DROP FROM BOTH (decided)
- Used by `src/components/markdown/chart/{Chart.astro,chart.js}`, wired into `Code.astro` for
  chart code-blocks. The dataset stats it showed were an experiment, not a needed feature.
- **Removal set:** delete `src/components/markdown/chart/`, remove the chart import + branch from
  `src/components/markdown/code/Code.astro`, drop `plotly` and `plotly.js-dist-min` from
  `package.json`. (Code.astro stays — only its chart branch is removed.)
- Revisit later as a full-only feature, decoupled from duckdb.

### The UI-stack cascade (big win, both versions)
Only **one** react-table lib is actually rendered: `@tanstack/react-table` in
`MarkdownTable.jsx` (markdown tables, shared path). The rest are dead weight or ride the
dataset feature:

| Package | Real usage | Action |
|---|---|---|
| `@tanstack/react-table` | MarkdownTable.jsx (shared) | **KEEP (both)** |
| `material-react-table` | **none — zero imports** | **DROP** (dead) |
| `@mui/material`, `@mui/icons-material`, `@mui/x-date-pickers` | none direct; transitive of material-react-table | **DROP** with it |
| `@emotion/react`, `@emotion/styled` | none direct; MUI peer | **DROP** with it |
| `mantine-react-table` | ServerTable.jsx (dataset, being deleted) | **DROP** |
| `@mantine/core`, `@mantine/dates`, `@mantine/hooks` | none direct; transitive of mantine-react-table | **DROP** with it |

Net: removing the dead `material-react-table` + the dataset feature collapses **two entire UI
kits (MUI + Mantine) + emotion** out of *both* profiles. Verify no stray `@mantine`/`@mui`
import remains before pruning `package.json`.

### sharp — it's an image-dimension probe, not a thumbnail/resize engine
- Exactly one real use: `content-structure/index.js` calls `sharp(path).metadata()` to read
  **width / height / orientation** at **collect** time (computes aspect ratio). **No resize, no
  thumbnails, no format conversion.** Stored in the `images` table; consumed by `gallery.astro`
  → PhotoSwipe (`data-pswp-width/height` need intrinsic dims). Gallery thumbnails are CSS-scaled.
- The second sharp reference (in `dist`) is Astro's `astro:assets` optimizer — a *separate*,
  optional concern, disabled in lite via a passthrough image service.
- **Does collection run in lite?** Yes for the extension previewing a live `.md` workspace —
  but the only thing sharp contributes is dimensions. So **don't drop gallery**; instead:
  - **Lite:** read dims with pure-JS **`image-size`** (no native build), or bake dims into the
    JSON export so no probe runs at all. Gallery works, zero native deps.
  - **Full:** keep sharp at collect for best orientation handling (or also switch to image-size).
- **"Full experience" easy opt-in (your fallback ask):** make `sharp` an **`optionalDependency`**.
  The collect dimension-reader tries `await import('sharp')` and falls back to `image-size`.
  Document one command — `pnpm add sharp` (or a VS Code setting / `pnpm run enable-sharp`) — to
  upgrade fidelity. Mirrors the extension's existing `engineSource: auto|local|registry` philosophy.
  > Note: making the probe pluggable touches `content-structure` (separate repo). Track as a
  > small follow-up there; until then lite bakes dims into the JSON export.

---

## 3. Data backend dispatcher (the keystone)

Consumers already import everything through one module — `src/libs/structure-db.js` — and never
touch SQL. That is the seam.

**Step A — safe refactor (no behavior change):**
- Rename current `src/libs/structure-db.js` → `src/libs/structure-db-sqlite.js`.
- New `src/libs/structure-db.js` is a thin dispatcher:
  ```js
  const backend = process.env.DOCS_BACKEND ?? config.dataBackend ?? 'sqlite';
  const impl = backend === 'json'
    ? await import('./structure-db-json.js')
    : await import('./structure-db-sqlite.js');
  export const { getEntry, getFirstDocument, getDocument, getItems, getAssetInfo,
    getAssetInfoBlob_version, getAssetInfoBlob_blob, getImageInfo, getAssetBlob,
    parseAssetLink } = impl;
  ```
- Dynamic `import()` means a `json` build **never loads `better-sqlite3`** — this is what lets
  `EXCLUDED_DEPS` finally drop the native dep. Validate: full website build is byte-identical.

**Step B — JSON generation as a *derived* format (not a parallel pipeline):**
- SQLite stays the single canonical build-time store.
- New `scripts/export-json.js` reads the SQLite DB and emits per-document JSON in the **exact
  shape `getEntry()` returns** (`{found, title, headings, items, data}`), plus an index for
  `getFirstDocument` and the static-path list.
- Assets: emit referenced blobs as files alongside the JSON (resolves the one hard part —
  lite has no `blob_store` table).

**Step C — minimal `structure-db-json.js`:** implement `getEntry` + `getFirstDocument` over the
exported JSON first; render one page with `DOCS_BACKEND=json`; then fill remaining exports +
asset resolution from disk.

---

## 4. Profile selection at build (`DOCS_PROFILE=lite|full`)

`astro.config.mjs` reads `DOCS_PROFILE` (default `full`) and conditionally:
- **integrations:** include `@astrojs/react` both; gate plotly/model-viewer islands behind a
  per-profile include list so lite's SSR output never references them.
- **image service:** `lite` → passthrough/noop; `full` → sharp.
- **vite.ssr.external / optimizeDeps.exclude:** lite excludes `better-sqlite3`, `duckdb`,
  `sharp`; full keeps current behavior.

`scripts/stage-engine.js`: set `EXCLUDED_DEPS` from the **lite** profile so the staged
`@microwebstacks/md-render` engine ships without `better-sqlite3`, `duckdb`, `sharp`, `duckdb`,
`xlsx`, plotly, three/model-viewer, octokit, passport. The extension engine becomes installable.

---

## 5. Environment variable strategy

`config.js` already implements the right pattern: **`MICROWEBSTACKS_*` env → `manifest.yaml`
→ `DEFAULT_MANIFEST`**. We extend it, we don't replace it.

### `.env` as the top override
- Today `dotenv.config()` runs in `server/server.js` only and does **not** override existing
  env. To make root `.env` win over the ambient/global environment **and** be present before
  `config.js` reads `process.env`, add a tiny preload `scripts/load-env.js`:
  ```js
  import * as dotenv from 'dotenv';
  dotenv.config({ override: true });   // root .env beats global env
  ```
  Load it first in `dev.js`, `collect.js`, `server.js`, and via `astro`'s config import so the
  precedence is uniform: **root `.env` > shell/global env > manifest.yaml > defaults**.

### Key variables

| Variable | Purpose | Default (localhost-first) | Lite | Full |
|---|---|---|---|---|
| `DOCS_PROFILE` | build profile | `full` | `lite` | `full` |
| `DOCS_BACKEND` | data source | `sqlite` | `json` | `sqlite` |
| `MICROWEBSTACKS_KROKI_SERVER` | diagram render endpoint | `http://localhost:18000` | inherit | inherit |
| `MICROWEBSTACKS_HOST` | bind host | `127.0.0.1` | inherit | inherit |
| `MICROWEBSTACKS_PORT` | port | `4321` | inherit | inherit |
| `MICROWEBSTACKS_PROTOCOL` | protocol | `http` | inherit | inherit |
| `MICROWEBSTACKS_DB_PATH` | SQLite path | `dataset/content.db` | unused | set |
| `MICROWEBSTACKS_DOCS_ROOT` | content root | `content` | workspace | set |
| `GITHUB_TOKEN` | fetch/auth (secret) | — (`.env` only) | unset | set |

### Diagram URL — flip default to localhost, public opt-in
`config.js` currently defaults kroki to `https://kroki.io` (public). Change default to
`http://localhost:18000` (the dockerized kroki below) and add a `MICROWEBSTACKS_KROKI_SERVER`
env override. Corporate sets their internal kroki URL; public `kroki.io` becomes an explicit
opt-in. One knob serves lite, full, docker, and corporate. **No Java inside VS Code** — the
extension always renders diagrams by POSTing to whatever URL is configured.

---

## 6. `compose.yaml` (local diagram rendering, localhost default)

`compose.yaml` at repo root — runs kroki locally so the default `http://localhost:18000` works
out of the box with zero secrets:

```yaml
services:
  kroki:
    image: yuzutech/kroki:latest
    ports:
      - "18000:8000"   # host 18000 → container 8000; default avoids local clashes
    environment:
      KROKI_MERMAID_HOST: mermaid
    depends_on: [mermaid]
  mermaid:
    image: yuzutech/kroki-mermaid:latest
    expose:
      - "8002"
```

Commands:
```bash
docker compose up -d          # start local kroki on http://localhost:18000
docker compose down           # stop
# point the app at it (already the new default; explicit form):
MICROWEBSTACKS_KROKI_SERVER=http://localhost:18000 pnpm dev
```
Ship this + a short README section. Corporate users skip docker and set
`MICROWEBSTACKS_KROKI_SERVER` to their internal endpoint instead. Localhost-default means it is
never wrong out of the box.

---

## 7. Execution order (de-risk the deployed path first)

1. ✅ **Token + `.env.example`** — DONE. Token expired/deleted (no action). Added `.env.example`
   (no secrets, documents all keys; `.gitignore` keeps real `.env` out, `.env.example` tracked).
2. ✅ **Step A dispatcher refactor** — DONE. `structure-db.js` → `structure-db-sqlite.js`; new
   `structure-db.js` is a `DOCS_BACKEND`-driven dynamic-import dispatcher (default sqlite); added
   `structure-db-json.js` placeholder so the json branch resolves at build time. Full `pnpm build`
   succeeded with identical output (plotly/ServerTable/ModelViewer chunks unchanged). **Keystone gate passed.**
3. ✅ **Env wiring** — DONE. Added `src/libs/load-env.js` (dotenv `override:true`, workspace-root
   `.env`), imported first in `config.js` (universal chokepoint — covers astro/dev/collect/server).
   `config.js` resolves `DOCS_PROFILE` (default full) and `DOCS_BACKEND` (default derived: lite⇒json,
   else sqlite), surfaced as `config.profile`/`config.dataBackend`; dispatcher mirrors the derivation
   (reads only `process.env`, never imports config). Verified: env override beats manifest, lite⇒json.
4. ✅ **Kroki default + compose** — DONE. Flipped `DEFAULT_MANIFEST` kroki to `http://localhost:18000`;
   added `MICROWEBSTACKS_KROKI_SERVER` override (injected into both `kroki_server` and
   `diagram.renderers.kroki.server` so `scripts/diagrams.js` honors it); added `compose.yaml`
   (yuzutech/kroki + mermaid, `18000:8000`). NOTE: root `manifest.yaml` still pins `https://kroki.io`,
   which (by design) overrides the code default — left untouched as the user's active config. README pending.
5. `scripts/export-json.js` + minimal `structure-db-json.js`; render one page with `DOCS_BACKEND=json`.
6. Asset-from-disk resolution for JSON backend (the hard part) → full lite parity for std MD + diagrams.
7. Profile-gate plotly/3D/xlsx islands; set lite image service to passthrough.
8. Update `stage-engine.js` `EXCLUDED_DEPS` (drop better-sqlite3, duckdb, sharp, plotly, three,
   model-viewer, xlsx, octokit, passport); package + install extension; measure size drop.
9. Decide duckdb full-fate (keep behind API routes, or drop entirely).

Gate after step 2: full build must be identical before proceeding.

---

## Decisions locked in
- ✅ Token: expired, deleted — no action.
- ✅ duckdb: **dropped from both** (removal set in §2).
- ✅ react-table: keep **`@tanstack/react-table`** only; drop material-react-table (+MUI/emotion)
  and mantine-react-table (+Mantine).
- ✅ Kroki default port: **18000** (host) → container 8000.
- ✅ sharp: image-dimension probe only; lite uses `image-size`/baked dims, sharp optional for full.
- ✅ Plotly: **dropped from both** (removal set in §2); revisit later, decoupled from duckdb.

_No open decisions — plan is finalized._
