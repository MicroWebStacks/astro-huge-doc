# File Tree Menu Test Proof

## Commands

```text
pnpm collect
```

Result: not run. `pnpm` is not on PATH in this shell.

```text
node scripts\collect.js
```

Result: failed before the new source-tree indexer ran due to the existing linked
`content-structure` package resolution issue:

```text
Cannot find package 'C:\dev\MicroWebStacks\content-structure\node_modules\glob\index.js'
```

```text
node --input-type=module
```

with a direct call to `indexSourceTree(...)`.

Result: passed.

```text
source-tree: indexed 109 entries
```

SQLite inspection confirmed:

- top-level folders include `docker`, `docs`, `plans`, `projects`, and `src`;
- root files include `.gitignore`, `AGENTS.md`, `README.md`, and `WORKFLOW.md`;
- dated plan folders contain linked `plan.md` and `implementation.md` children.

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. The first build attempt without the env var failed because
Astro telemetry tried to create `C:\Users\wassi\AppData\Roaming\astro\Config`,
which is outside the writable sandbox.

```text
node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4321/
```

Result: passed. Runtime response was HTTP 200 and rendered menu HTML contained
`docker`, `plans`, `2026-06-26-age-gqc`, and `plan.md`.

## Gaps

- Full `pnpm collect` remains unproven in this shell because `pnpm` is missing
  and the linked package dependency issue blocks `node scripts\collect.js`.

## Follow-Up Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Vite reported the existing large chunk warnings.

```text
$env:MICROWEBSTACKS_PORT='4327'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4327/plans/closed
```

Result: passed with a temporary server process. Runtime HTML checks confirmed:

- `plan` is present as a rendered Markdown route;
- raw source-only filenames such as `embeddings.yaml`, `architecture.yaml`,
  `docker-compose.yml`, `.py` files, lock files, and `pnpm-lock` are absent
  from the rendered menu markup.

## Filename Label Follow-Up Proof

```text
$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build
```

Result: passed. Astro build succeeded with the existing large chunk warnings.

```text
$env:MICROWEBSTACKS_PORT='4333'; node server\server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4333/
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4333/specification/toc-menu-controls
```

Result: passed with a temporary server process. Runtime HTML checks confirmed:

- the app bar still contains `Home`;
- the pages file tree contains `README`;
- the file tree markup also includes the new depth-label control.
