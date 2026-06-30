# MicroWebStacks Docs Preview

Browse large Markdown documentation sets inside VS Code — rendered like a real
documentation site, not a single-file preview.

## Features

- **📁 File tree** — navigate a whole multi-folder docs repo from a sidebar, not one file at a time.
- **🔖 Outline / table of contents** — jump between headings of the current page.
- **📊 Diagrams** — mermaid, plantuml, and blockdiag blocks render to SVG.
- **📋 Tables** — Markdown tables become sortable, readable data tables.
- **🎨 Syntax highlighting** — fenced code blocks highlighted with Shiki.
- **🖼️ Image gallery** — image sets open in a zoomable lightbox.

## Getting started

1. Open a folder that contains your Markdown documentation.
2. Run **MicroWebStacks: Preview Docs in VS Code** from the Command Palette (`Ctrl+Shift+P`).
3. Browse the rendered docs. Use **Open Docs in Browser** to view them in your external browser.

The workspace folder is the documentation root by default. Other commands:
**Restart Docs Preview Server** and **Stop Docs Preview Server**.

## Configuration

| Setting | Default | What it does |
|---|---|---|
| `microwebstacks.preview.krokiServer` | `http://localhost:18000` | Diagram renderer URL. Point it at a local [Kroki](https://kroki.io) (Docker), the public `https://kroki.io`, or your own internal endpoint. |
| `microwebstacks.preview.docsRoot` | _workspace folder_ | Documentation root, if your docs live in a subfolder. |

Diagrams need a reachable Kroki server at the configured URL — the simplest is a
local one via Docker. After changing a setting, run **Restart Docs Preview
Server**.

> Advanced: `microwebstacks.preview.engineSource` and
> `microwebstacks.preview.enginePath` control where the rendering engine is
> loaded from. The defaults are fine for most users.
