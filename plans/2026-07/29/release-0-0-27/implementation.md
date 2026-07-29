# Implementation

## Progress

[###] Done - release source committed, upload-ready VSIX packaged and verified, and release evidence recorded.

## Release Pair

- `@microwebstacks/md-render` 0.0.23
- `microwebstacks.markdown-site-preview` 0.0.27

## Included Changes

- Bundled-only, network-free extension engine acquisition with cold/warm timing
  logs.
- Preserved Markdown list hierarchy and inline formatted fragments around
  links.
- Correct filesystem handling for spaces and percent characters in workspace
  paths.
- Focused regression tests and extension hydration diagnostics.
- Lockfile synchronization for the already-declared XLSX dependency.

## Source And Packaging

- Source commit: `d9f20ec` (`Release engine 0.0.23 and extension 0.0.27`).
- The first packaging attempt correctly rejected a stale full-workspace build
  containing `dist/client/data` and `dist/client/images`.
- Rebuilt with `DOCS_PROFILE=lite` and
  `MICROWEBSTACKS_WORKSPACE_ROOT=.tmp/release-0-0-27-empty-workspace`, matching
  the isolation used by `scripts/release-engine.js`.
- Final packaging succeeded with clean build stamps for commit `d9f20ec`.
- Artifact:
  `packages/vscode-extension/markdown-site-preview.vsix`
  (104,680,212 bytes / 99.83 MiB).
- Verified extension 0.0.27, bundled engine 0.0.23, two bundled-engine VSIX
  entries, a 104,624,790-byte authenticated `engine.tgz`, 26,961 vendored
  dependency files, and 22 total VSIX entries.

## Publication Boundary

The npm engine package and Marketplace extension were not published. The VSIX
is ready for the maintainer's manual Marketplace upload.

