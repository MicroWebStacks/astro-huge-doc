# Release Engine 0.0.24 and Extension 0.0.28

## Goal

Prepare a coordinated release of the changes since the previous engine 0.0.23
and extension 0.0.27 release.

## Scope

- Bump the engine pin to 0.0.24 and extension version to 0.0.28.
- Add aligned engine and extension release notes.
- Validate the repository and release metadata.
- Commit and push the release source state.
- Build and verify an upload-ready VSIX from the release commit.

## Non-goals

- Do not publish the npm engine package.
- Do not upload the VSIX to the Visual Studio Marketplace.
- Do not close feature packets whose remaining interactive checks are outside
  this release-preparation task.

## Phases

1. Confirm the previous release boundary and unused next versions.
2. Update versions and release notes, then validate and commit the source state.
3. Package and verify the VSIX, record evidence, close the packet, and push.

## Exit Criteria

- Engine 0.0.24 and extension 0.0.28 metadata and changelogs are aligned.
- Automated checks and the isolated lite build pass.
- The VSIX contains the bundled engine and clean release-commit provenance.
- Release commits are pushed and the artifact path and digest are reported.
