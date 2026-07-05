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

- **Node.js 18+** (with npm) installed and on your PATH - the preview runs a local
  rendering engine with it. On first use the engine (~a few MB download) is
  installed automatically from the npm registry; later runs are offline.
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

> Advanced: `microwebstacks.preview.engineSource` and
> `microwebstacks.preview.enginePath` control where the rendering engine is
> loaded from. The defaults are fine for most users.
