# Engine 0.0.19 and extension 0.0.23 release

## Problem summary

The active-editor tracking, preview lock, rendered-route history, mobile
navigation, and link-index fixes are implemented but not yet represented by a
coordinated engine and extension release pair.

## Goal

Prepare `@microwebstacks/md-render` 0.0.19 and Markdown Site Preview 0.0.23
with complete changelogs, aligned version pins, and validated publish/upload
artifacts.

## Scope

- Finalize the engine and extension changelogs.
- Bump the engine version staged by the release tooling to 0.0.19.
- Bump the extension to 0.0.23 and pin engine 0.0.19.
- Build and package the engine and VSIX without publishing either artifact.
- Record validation and the required engine-first release order.

## Non-goals

- Publishing to npm.
- Uploading to the Visual Studio Marketplace.
- Committing or pushing release changes.

## Exit criteria

- Version metadata and changelogs describe the release pair.
- The engine package and extension VSIX are produced successfully.
- Focused tests, build, package verification, and plan consistency checks pass.
