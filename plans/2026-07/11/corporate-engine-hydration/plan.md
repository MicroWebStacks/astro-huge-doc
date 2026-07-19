# Corporate Engine Hydration Robustness

## Problem

Extension 0.0.13 can fail on a corporate Windows endpoint when activation
renames the freshly extracted vendored dependency tree from `_modules` to
`node_modules`. The rename is unnecessary and is especially vulnerable to
endpoint-security filesystem filters.

## Scope

- Extract vendored `_modules` tar entries directly into `node_modules`.
- Preserve tar path traversal protections and transactional final activation.
- Emit automatic, privacy-conscious PASS/FAIL diagnostics when engine
  extraction or activation fails.
- Add focused regression coverage that can also be run from a Node 22 clone.

## Non-goals

- Reproduce a specific vendor's proprietary EDR stack.
- Change the bundled engine archive contract or registry publishing format.
- Add network-dependent diagnostics or upload telemetry.

## Exit criteria

- Hydration contains no `_modules` to `node_modules` filesystem rename.
- Successful extraction produces a usable engine and leaves no `_modules`.
- Failure output identifies the activation stage and reports local filesystem
  probes as named PASS/FAIL checks without absolute user paths.
- Focused tests and plan consistency checks pass.
