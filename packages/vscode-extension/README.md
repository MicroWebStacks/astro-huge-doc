<h1 align="center">Markdown Site Preview</h1>

<p align="center">
Browse your whole Markdown documentation like a website - rendered as a real
documentation site, not a single-file preview.
</p>

<p align="center">
<img src="https://raw.githubusercontent.com/MicroWebStacks/astro-huge-doc/main/packages/vscode-extension/images/markdown-site-preview.png" alt="Markdown source in the editor next to the rendered documentation site: pages tree, mermaid sequence diagram, data table, and outline with table and diagram markers" width="100%"/>
</p>

## Features

- **File tree** - navigate a whole multi-folder docs repo from a sidebar, not one file at a time.
- **Outline / table of contents** - jump between headings of the current page, with per-section table and diagram markers.
- **Diagrams** - Mermaid renders client-side; PlantUML and BlockDiag render to SVG through Kroki.
- **Math** - inline and block formulas render with KaTeX.
- **Tables** - Markdown tables become sortable, readable data tables.
- **Syntax highlighting** - fenced code blocks highlighted with Shiki.

## Requirements

- No system Node.js or npm is required on the normal install path. On first
  use the extension runs the bundled lite/json engine shipped inside the VSIX
  and uses VS Code's own bundled runtime to execute its scripts. In `auto`
  mode the npm registry is only a fallback path when the bundled payload is
  unavailable; `registry` mode forces that published-engine path explicitly.
- Rare fallback case: if a VS Code/Electron build disables
  `ELECTRON_RUN_AS_NODE`, set `MICROWEBSTACKS_NODE_PATH` to a Node.js 18+
  executable or make `node` available on PATH.
- Optional: a reachable [Kroki](https://kroki.io) server if your docs contain
  PlantUML or BlockDiag diagrams (see Configuration below). Mermaid does not
  need a server. Pages still load without Kroki - only PlantUML/BlockDiag
  diagrams are skipped.

## Getting started

1. Open a folder that contains your Markdown documentation.
2. Run **Markdown Site Preview: Open Preview** from the Command Palette (`Ctrl+Shift+P`).
3. Browse the rendered docs. Use **Markdown Site Preview: Open in Browser** to view them in your external browser.

The workspace folder is the documentation root by default. Other commands:
**Markdown Site Preview: Restart Server** and **Markdown Site Preview: Stop Server**.

## Configuration

| Setting | Default | What it does |
|---|---|---|
| `microwebstacks.preview.krokiServer` | `http://localhost:18000` | Kroki URL for PlantUML and BlockDiag. Point it at a local [Kroki](https://kroki.io) (Docker), the public `https://kroki.io`, or your own internal endpoint. |
| `microwebstacks.preview.docsRoot` | _manifest `render.folder` or `output.content`_ | Documentation root, if your docs live in a subfolder. |

PlantUML and BlockDiag need a reachable Kroki server at the configured URL - the
simplest is a local one via Docker. Mermaid renders client-side with no server
setting. After changing a setting, run **Markdown Site Preview: Restart Server**.

### Local Kroki via Docker

Nothing is sent off your machine. Start a local Kroki server on the default
port the extension already expects (`http://localhost:18000`):

```powershell
docker run -d --name mws-kroki -p 18000:8000 yuzutech/kroki:latest
```

Stop it when you're done:

```powershell
docker stop mws-kroki && docker rm mws-kroki
```

If you have the `astro-huge-doc` repository checked out, `compose.yaml` at the
repo root defines the same service - run `docker compose up -d` /
`docker compose down` (or `pnpm kroki:up` / `pnpm kroki:down`) from there
instead.

> Advanced: `microwebstacks.preview.engineSource` and
> `microwebstacks.preview.enginePath` control where the rendering engine is
> loaded from. The defaults are fine for most users.
