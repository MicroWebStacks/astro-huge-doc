# vectormind.github.io adoption workflow

Reference for the first intended external consumer of the reusable render
command and Action (see `plans/2026-07/12-reusable-render-action/plan.md`,
problem summary and Non-goals). This packet does not implement or deploy this
workflow, and does not modify the `vectormind.github.io` repository — it only
records the exact pinned workflow that repository should adopt once a real
`astro-huge-doc` Action release and matching `@microwebstacks/md-render`
version exist.

## Deployment shape

`vectormind.github.io` is a user/org GitHub Pages repository, so it serves
from the root of its own domain, not a repository subpath:

- `site`: `https://vectormind.github.io/`
- `base`: unset (defaults to `/` — no `--base`/`base:` input needed, unlike a
  project-page repository)

## Workflow to add to `vectormind.github.io` (`.github/workflows/pages.yml`)

```yaml
name: Deploy site

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Render static site
        id: render
        uses: MicroWebStacks/astro-huge-doc@<pinned-tag-or-sha>
        with:
          engine-version: '<pinned @microwebstacks/md-render version>'
          workspace: '.'
          out-dir: 'dist'
          site: 'https://vectormind.github.io/'

      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${{ steps.render.outputs.artifact-path }}

  deploy:
    needs: render
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

This is the same shape as this repository's own
`.github/workflows/render-example.yml`, with `base` omitted (root deployment)
and `site` filled in for the real domain. `engine-version` and the Action ref
are placeholders for the same reason `render-example.yml`'s are: no published
`@microwebstacks/md-render` version currently contains `bin/md-render.js`
(Phase 3 added it but nothing has been tagged/released yet — see
`action.yml`'s `engine-version` input and the "Deviations from the plan"
note in `plans/2026-07/12-reusable-render-action/implementation.md`'s Phase 4
section). Once a release exists, both placeholders resolve to a single pinned
tag/SHA pair.

## What `vectormind.github.io` owns, that `astro-huge-doc` does not decide

Per the ownership table in this spec's "Ownership boundaries" section, all of
the following are the consumer repository's own decisions, not something this
packet prescribes:

- Its own `content/` (or `manifest.yaml`-configured `render.folder`) layout
  and how content gets into that repository (a `fetch.github` step, a
  submodule, or content authored directly there — this packet's own
  `manifest.yaml` `fetch.github` section is one example shape, not a
  requirement).
- Whether it needs a `manifest.yaml` at all — the Action's `workspace`/
  `manifest`/`out-dir` inputs default to sane values (`.`, unset, `dist`) that
  work without one, as proven by this packet's Phase 5 fixture (a bare
  `content/` tree with no `manifest.yaml`).
- Its own Pages upload/deploy permissions and environment configuration
  (`actions/upload-pages-artifact`, `actions/deploy-pages`), which
  `action.yml` deliberately holds none of (OP-006).

## Verification basis

This shape is not independently exercised against the real
`vectormind.github.io` repository (out of scope per the plan's Non-goals). It
is derived from, and structurally identical to, `.github/workflows/
render-example.yml`, which Phase 5 validated by running the Action's exact
install/build steps against a local fixture and confirming the resulting
artifact serves correctly in a real browser at both a repository base path
and the root (see the Phase 5 section of `implementation.md`). The only
difference for a root-deployed user/org page is omitting `base`.
