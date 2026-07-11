---
title: PlantUML Demo
order: 3
---

# PlantUML Demo

PlantUML renders in the browser through the official `@plantuml/core` engine.
This page intentionally contains five diagrams to exercise the serialized
render queue. It requires no Java, Docker, or external diagram server.

## Preview Flow

```plantuml
@startuml
skinparam monochrome true
skinparam shadowing false

actor User
participant "VS Code Extension" as Ext
participant "Render Engine" as Engine
participant "Browser PlantUML" as PlantUML

User -> Ext : Open Preview
Ext -> Engine : collect + serve
Engine --> Ext : page + raw PlantUML
Ext --> PlantUML : lazy-load client renderer
PlantUML --> Ext : inline SVG
@enduml
```

## Class View

```plantuml
@startuml
class User {
  +name: String
  +login()
}

class Account
class Session {
  +token: String
}

User --> Account
User --> Session
Account --> Session
@enduml
```

## Activity View

```plantuml
@startuml
start
:Open docs;
if (PlantUML?) then (yes)
  :Render client-side;
else (no)
  :Render normally;
endif
stop
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

## Data View

```plantuml
@startuml
component Web
component API
database DB

Web --> API
API --> DB
@enduml
```

## Linked PlantUML

The [linked PlantUML fixture](./linked-client-render.puml) uses the same client
renderer as fenced blocks.

## Notes

- `content/` can keep receiving fetched material.
- `demo/` can stay small and curated for smoke tests.
- Rendering chooses the docs root independently from fetch destination now.
- Client mode cannot automatically resolve arbitrary local `!include` files
  and omits some large optional sprite libraries. Configure
  `diagram.languages.plantuml: kroki` when affected content needs the server
  compatibility path.
