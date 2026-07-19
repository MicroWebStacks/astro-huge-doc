# Implementation log

[#-----] Phase 1/6 - path-first collection, schema promotion, malformed-YAML recovery, and demo fixtures in progress.

## 2026-07-19

- Started Stage 1: full collection now uses slugified path segments for identity; frontmatter `slug` remains the only identity override and `title` is display-only.
- Added the `type`, `description`, and `resource` document columns; `timestamp` is mapped to the existing `date` column. Malformed YAML now retains document bodies while recovering parseable leading fields where possible.
- Added demo fixtures for generic and typed frontmatter, link classification, and `index.md`/`readme.md` landing priority. `manifest.yaml` already renders `demo/`, so no configuration switch was required.
- Recorded focused validation and the current local package-link limitation in `test.md`.
