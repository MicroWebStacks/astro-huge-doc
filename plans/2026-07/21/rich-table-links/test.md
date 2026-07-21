# Rich links in Markdown tables - validation

## Commands and results

- `node --test test/rich-table-links.test.js` - passed, 4/4 tests.
- `corepack pnpm@10.22.0 test` - passed, 60/60 tests.
- `corepack pnpm@10.22.0 build` - passed; only existing Astro route/chunk-size
  warnings were emitted.
- `node scripts/check-plans.js` - passed before closure; rerun after the atomic
  plan-index closure.
- Scoped `git diff --check` - passed.

## Coverage

- labelled external and bare GFM URL token preservation;
- internal and unresolved presentation data;
- text-only sort keys separated from rendered tokens;
- unchanged plain table string-row conversion;
- table asset UID/blob contract plus separately stored complex AST;
- lite nested-link classification, route rewriting, and relation indexing.

## Environment note

The initial dependency junctions were incomplete. A frozen offline
`pnpm@10.22.0 install --force` rebuilt `node_modules` from the local pnpm store;
the lockfile did not change.
