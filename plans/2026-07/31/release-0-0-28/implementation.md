# Implementation

## Progress

[##-] Phase 2/3 - versions, notes, tests, and isolated build complete; packaging next.

## Release Pair

- `@microwebstacks/md-render` 0.0.24
- `microwebstacks.markdown-site-preview` 0.0.28

## Release Boundary

- Previous release source commit: `d9f20ec` (engine 0.0.23 and extension
  0.0.27).
- Follow-up verification commit: `0f3268d`.
- Current feature commit: `922a024`.
- npm registry inspection confirmed that engine 0.0.24 is unused.

## Source Preparation

- Bumped the extension version and bundled engine pin.
- Added aligned engine and extension release notes for gallery deep linking,
  the interactive graph, navigation behavior, inline-fragment layout, and
  frontmatter image handling.
- Repaired the local pnpm dependency tree from the frozen lockfile after the
  existing `glob` links proved incomplete.
- Full tests and the isolated lite production build pass.
- The first packaging attempt stopped at the staged-engine size guard: the new
  vis-network package ships the same browser library in several build families,
  raising the self-contained tree to 504.9 MB against a 460 MB limit.
- Updated engine staging to retain the exact standalone ESM entry imported by
  the graph while removing redundant UMD, peer, dist, esnext, declaration,
  style, and source-map variants from the vendored copy.
- Focused restaging reduced the engine tree to 427.5 MB and the retained
  standalone ESM module imports successfully.

## Publication Boundary

The npm engine package and Marketplace extension remain unpublished. This task
prepares and pushes the source release plus an upload-ready local VSIX.
