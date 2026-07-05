---
title: PlantUML Demo
order: 3
---

# PlantUML Demo

PlantUML remains a server-rendered diagram path through the configured
Kroki-compatible endpoint.

## Preview Flow

```plantuml
@startuml
skinparam monochrome true
skinparam shadowing false

actor User
participant "VS Code Extension" as Ext
participant "Render Engine" as Engine
participant "Kroki" as Kroki

User -> Ext : Open Preview
Ext -> Engine : collect + serve
Engine -> Kroki : POST PlantUML source
Kroki --> Engine : SVG
Engine --> Ext : rendered page
@enduml
```

## Component View

```plantuml
@startuml
skinparam monochrome true
skinparam componentStyle rectangle

package "Workspace" {
  [demo/]
  [content/]
}

package "Config" {
  [render.folder = demo]
  [output.content = content]
}

[render.folder = demo] --> [demo/]
[output.content = content] --> [content/]
@enduml
```

## Notes

- `content/` can keep receiving fetched material.
- `demo/` can stay small and curated for smoke tests.
- Rendering chooses the docs root independently from fetch destination now.
