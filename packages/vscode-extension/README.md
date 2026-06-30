# MicroWebStacks Docs Preview

Preview large Markdown documentation sets inside VS Code. Open a folder of
Markdown, run one command, and browse the rendered docs — with a file-tree and
table-of-contents viewer, syntax highlighting, tables, image galleries, and
diagrams (mermaid, plantuml, blockdiag).

## Getting started

1. Open a folder that contains your Markdown documentation.
2. Run **MicroWebStacks: Preview Docs in VS Code** from the Command Palette
   (`Ctrl+Shift+P`).
3. The rendered docs open in a preview. Use **Open Docs in Browser** to view the
   same preview in your external browser.

By default the workspace folder is treated as the documentation root. If your
docs live in a subfolder (or you use a `manifest.yaml`), point the extension at
the right place with the `Docs root` setting.

## Commands

- **MicroWebStacks: Preview Docs in VS Code**
- **MicroWebStacks: Open Docs in Browser**
- **MicroWebStacks: Restart Docs Preview Server**
- **MicroWebStacks: Stop Docs Preview Server**

## Diagrams: pointing at a renderer

Diagrams are rendered by a [Kroki](https://kroki.io)-compatible server. The
extension sends your diagram source to whatever URL you configure and displays
the returned SVG. You choose where that goes:

| You want… | Set the diagram server URL to |
|---|---|
| Local, offline rendering (nothing leaves your machine) | `http://localhost:18000` (run a local Kroki via Docker) |
| The hosted public service | `https://kroki.io` |
| Your company's internal renderer | e.g. `https://kroki.example.internal` |

### Where to set it

Open **Settings** (`Ctrl+,`), search for **MicroWebStacks**, and edit
**Diagram server URL** (`microwebstacks.preview.krokiServer`). It defaults to
`http://localhost:18000`. After changing it, run **Restart Docs Preview
Server** so the new URL takes effect.

> Local rendering needs a Kroki server listening on that URL. The simplest way
> is Docker — see the repository for a ready-made `compose.yaml`
> (`docker compose up -d`). Use the public or an internal URL if you'd rather
> not run one locally.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `microwebstacks.preview.krokiServer` | `http://localhost:18000` | Base URL of the Kroki-compatible diagram renderer. |
| `microwebstacks.preview.docsRoot` | _(workspace folder)_ | Documentation root inside the workspace. Defaults to manifest `output.content` when a `manifest.yaml` exists, otherwise the workspace folder. |
| `microwebstacks.preview.engineSource` | `auto` | Where the rendering engine is sourced from: `auto`, `local`, or `registry`. |
| `microwebstacks.preview.enginePath` | _(auto-detected)_ | Path to a local engine checkout, used as the engine (highest priority). |
