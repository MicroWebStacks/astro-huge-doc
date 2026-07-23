# Implementation

## Progress

[####] Done - release metadata and publish/upload artifacts are prepared and
validated.

## Changes

- Promoted the engine changelog entries to version 0.0.19 dated 2026-07-23.
- Promoted the extension changelog entries to version 0.0.23 dated 2026-07-23.
- Updated the extension manifest to version 0.0.23 and engine pin 0.0.19.
- Staged the vendored engine package in `packages/md-render/` and created
  `microwebstacks-md-render-0.0.19.tgz`.
- Created `packages/vscode-extension/markdown-site-preview.vsix`; packaging
  verified the embedded engine tarball, required runtime files, and vendored
  dependency payload.

## Release ordering

The extension VSIX contains a bundled copy of the pinned engine for normal
automatic resolution. The npm engine must still be published before the
extension is uploaded so explicit registry mode and registry fallback can
resolve the same pinned version.

## Provenance

Both artifacts are stamped with commit `f001a73` and `dirty`, accurately
reflecting that the maintainer-owned release commit has not yet been created.
