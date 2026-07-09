# Open Plans

Plan packets with work still outstanding. See each folder for details.

| Plan | Date | Status | Summary |
| --- | --- | --- | --- |
| [2026-06-28-vscode-marketplace-readiness](2026-06/28-vscode-marketplace-readiness/plan.md) | 2026-06-28 | implementation in progress | Phase 2 bootstrap now includes a bundled VSIX engine fallback; runtime hardening, trust review, platform validation, and publishing flow still remain. |
| [2026-07-04-features-alignment](2026-07/04-features-alignment/plan.md) | 2026-07-04 | implementation in progress | Research and quick wins are done; Phase 3 math support is next. |
| [2026-07-09-vsix-packaging-performance](2026-07/09-vsix-packaging-performance/plan.md) | 2026-07-09 | planning | Ship the bundled engine as a single `npm pack` tarball (reusing the existing registry-tier tar reader) plus prune inert vendored files, to cut `pnpm ext:package` from ~20-30 minutes down to about a minute, without any JS bundler. |
