---
title: PlantUML Demo
order: 3
---

# PlantUML Demo

PlantUML renders in the browser through the official `@plantuml/core` engine.
This page intentionally contains six diagrams to exercise the serialized
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

## Wide Diagram Width Test

Intentionally much wider than the prose measure: the shell should grow with
the available content column and the diagram should shrink to fit it, never
rendering larger than its natural size.

```plantuml
@startuml
participant Browser
participant "CDN Edge" as CDN
participant "API Gateway" as GW
participant "Auth Service" as Auth
participant "Catalog Service" as Cat
participant "Inventory Service" as Inv
participant "Payment Service" as Pay
participant "Message Queue" as Q
participant Worker
participant Database

Browser -> CDN : GET /checkout
CDN -> GW : forward request
GW -> Auth : validate session token
Auth --> GW : session ok
GW -> Cat : fetch cart items
Cat -> Inv : reserve stock
Inv --> Cat : reservation id
GW -> Pay : charge card
Pay -> Q : enqueue receipt job
Q -> Worker : deliver job
Worker -> Database : persist order
Database --> Worker : order id
Worker --> Browser : email receipt sent
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

## Wide Diagram Width Test

A second, distinct wide diagram placed at the very end of the page, to verify
that width-shrinking behavior also holds for the last diagram rendered on a
page (not just ones followed by more content):

```plantuml
@startuml
participant Browser
participant "CDN Edge" as CDN
participant "API Gateway" as GW
participant "Metrics Collector" as Metrics
participant "Log Aggregator" as Logs
participant "Trace Collector" as Traces
participant "Alert Manager" as Alert
participant "Dashboard Service" as Dash
participant "Notification Service" as Notify
participant "On-Call" as OnCall

Browser -> CDN : GET /dashboard
CDN -> GW : forward request
GW -> Metrics : query latency series
GW -> Logs : query error logs
GW -> Traces : query slow traces
Metrics -> Alert : latency above threshold
Logs -> Alert : error rate above threshold
Alert -> Dash : raise incident banner
Alert -> Notify : trigger page
Notify -> OnCall : send SMS + call
OnCall --> Notify : acknowledge
Notify --> Alert : ack recorded
Dash --> Browser : incident visible on page
@enduml
```
