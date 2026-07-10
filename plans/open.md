# Open Plans

Plan packets with work still outstanding. See each folder for details.

| Plan | Date | Status | Summary |
| --- | --- | --- | --- |
| [2026-06-28-vscode-marketplace-readiness](2026-06/28-vscode-marketplace-readiness/plan.md) | 2026-06-28 | implementation in progress | Phase 2 bootstrap now includes a bundled VSIX engine fallback; runtime hardening, trust review, platform validation, and publishing flow still remain. |
| [2026-07-04-features-alignment](2026-07/04-features-alignment/plan.md) | 2026-07-04 | implementation in progress | Research and quick wins are done; Phase 3 math support is next. |
| [2026-07-09-vsix-packaging-performance](2026-07/09-vsix-packaging-performance/plan.md) | 2026-07-09 | implementation in progress | Phases 1-2 done and verified (packaging: 22,846 -> 12 VSIX entries, ~20-30min -> ~1min; shared extract/activate refactor with 21 passing fault-injection checks). Phase 3: bundled-tier hydration proven directly on disk in a clean-profile install; full HTTP-200 proof blocked by an environment-specific spawn issue, not this packet's code - needs a re-run on a less-loaded machine. |
