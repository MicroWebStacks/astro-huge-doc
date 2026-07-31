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

## Publication Boundary

The npm engine package and Marketplace extension remain unpublished. This task
prepares and pushes the source release plus an upload-ready local VSIX.
