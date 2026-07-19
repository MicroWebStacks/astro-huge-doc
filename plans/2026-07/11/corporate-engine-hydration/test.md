# Test / Validation

## Commands

```text
node --check packages/vscode-extension/extension.js
node --check scripts/diagnose-extension-hydration.cjs
node scripts/diagnose-extension-hydration.cjs
rg -n "fsp\.rename\(path\.join\(tempRoot, vendoredDir\)|_modules.*node_modules.*rename|rename.*_modules" packages/vscode-extension/extension.js
corepack pnpm@10.22.0 check:plans
git diff --check
```

## Results

- JavaScript syntax checks passed.
- The standalone diagnostic reported:
  - `PASS - engine activation`
  - `PASS - direct node_modules extraction`
  - `PASS - no vendored alias remains`
  - `PASS - usable engine validation`
  - `PASS - automatic PASS/FAIL diagnostic output`
- The rename scan found only explanatory prose and no `_modules` filesystem
  rename call.
- Plan consistency passed for all 19 packets before closure.
- `git diff --check` passed.

## Remaining external proof

The corporate endpoint can run `node scripts/diagnose-extension-hydration.cjs`
from a clone and report only the named PASS/FAIL checks. The next released VSIX
will also run the diagnostic block automatically if real activation fails.
