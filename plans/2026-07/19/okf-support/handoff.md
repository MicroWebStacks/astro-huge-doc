# Astro Huge Doc — OKF Support Handoff

## Purpose

This document defines a product and specification handoff for adding optional **Open Knowledge Format (OKF)** support to Astro Huge Doc.

The goal is not to turn Astro Huge Doc into a dedicated graph viewer or require users to adopt OKF. The goal is to preserve the current zero-config Markdown experience while making OKF-compliant content more useful when semantic metadata and relationships are available.

The intended behavior is:

> Plain Markdown remains a normal documentation website.  
> OKF-compliant Markdown becomes a richer, semantically navigable knowledge website.

Implementation details, storage choices, parsing libraries, and exact code structure are intentionally left open for later analysis.

---

## 1. Product Principle

OKF should be implemented as **progressive enhancement**.

| Content level | Expected website behavior |
|---|---|
| Plain Markdown | Existing Astro Huge Doc rendering |
| Markdown with frontmatter | Richer document metadata where useful |
| OKF concept | Concept identity, type, tags, relationships, backlinks, validation |
| OKF bundle | Index-driven navigation, history, graph exploration, semantic search, context export |

No OKF feature should make normal Markdown harder to use.

OKF support must be:

- Optional
- Tolerant
- Backward-compatible
- Useful without configuration
- Capable of being configured explicitly
- Consistent across full website, static output, and VS Code preview where possible

---

## 2. What OKF Adds

OKF provides a semantic layer over Markdown files.

The most valuable OKF concepts for Astro Huge Doc are:

- A Markdown file can represent a typed knowledge concept.
- The file path acts as a stable concept identity.
- Frontmatter can provide:
  - `type`
  - `title`
  - `description`
  - `resource`
  - `tags`
  - `timestamp`
  - additional unknown fields
- Markdown links form relationships between concepts.
- `index.md` provides authored progressive-disclosure navigation.
- `log.md` provides curated knowledge history.
- Broken links and incomplete metadata must not prevent consumption.
- Unknown types and fields must be preserved and tolerated.

Astro Huge Doc should treat OKF as an additional interpretation of existing Markdown files, not as a different source format.

---

## 3. Goals

### Primary goals

1. Preserve Astro Huge Doc's zero-config Markdown website behavior.
2. Detect and enrich OKF content automatically when possible.
3. Expose OKF relationships in a reading-centered interface.
4. Support authored indexes without losing filesystem navigation.
5. Provide backlinks, type views, tag views, and validation feedback.
6. Keep concept identity stable even when titles change.
7. Make large OKF bundles easier to navigate than graph-only viewers.
8. Support human readers and optional agent-oriented context export.

### Secondary goals

- Support multiple OKF bundles in one website.
- Provide a full graph explorer as an optional feature.
- Connect OKF log entries to repository history or stored versions later.
- Allow future type-specific renderers without requiring a fixed type registry.
- Expose semantic data through optional JSON endpoints or exports.

---

## 4. Non-Goals

The first OKF integration should not attempt to:

- Replace Markdown with a custom authoring format.
- Require every page to be OKF-compliant.
- Define a universal ontology.
- Treat every Markdown link as a formally typed semantic relation.
- Replace OpenAPI, JSON Schema, Protobuf, Avro, SQL schemas, or other domain formats.
- Become a full visual editor.
- Make the global graph the primary reading interface.
- Fail website builds for ordinary content-quality warnings by default.
- Require network access to render or validate local content.
- Hide malformed or incomplete documents from readers.

---

## 5. Compatibility Rules

### 5.1 Plain Markdown must continue to work

A repository with no OKF metadata should behave exactly like a normal Astro Huge Doc website.

No new mandatory manifest section, file, folder, or frontmatter key should be required.

### 5.2 Partial adoption must work

A documentation tree may contain:

- Plain Markdown pages
- Frontmatter-enhanced pages
- OKF concepts
- Reserved OKF files
- Non-Markdown assets

These must coexist.

### 5.3 Unknown types must be accepted

OKF types are free-form.

The website may provide visual treatment for known types, but it must still render unknown types correctly.

Examples:

```yaml
type: metric
```

```yaml
type: api-endpoint
```

```yaml
type: internal-policy
```

```yaml
type: something-not-yet-known
```

All are valid for consumption.

### 5.4 Unknown frontmatter fields must be preserved

Unknown metadata may be:

- Hidden by default
- Displayed in an expandable metadata panel
- Available to plugins
- Included in exports
- Indexed for future use

It should not be discarded merely because Astro Huge Doc does not understand it.

### 5.5 Broken internal links must not block rendering

A missing target may represent:

- Planned knowledge
- A stale link
- A bundle boundary
- A renamed concept
- A temporary migration issue

The page should still render.

The interface should clearly distinguish:

- Resolved internal concept
- Unresolved internal concept
- External URL
- Non-concept local file

---

## 6. Detection and Activation

Recommended activation modes:

```yaml
okf:
  enabled: auto
```

Possible values:

- `auto`
- `true`
- `false`

### `auto`

Astro Huge Doc detects OKF semantics when there is strong evidence, such as:

- A Markdown file with a non-empty `type`
- A root `index.md` with an OKF version declaration
- Multiple typed concepts under a common root
- An authored `index.md` linking to typed concepts
- A configured bundle root

Auto-detection should be conservative and must not reinterpret normal Markdown aggressively.

### `true`

The configured root is treated as an OKF bundle.

This mode may enable stronger validation and bundle-level views.

### `false`

No OKF enrichment is performed.

Normal Markdown rendering remains unchanged.

---

## 7. Bundle Model

Astro Huge Doc should support one or more logical OKF bundles.

A bundle needs:

- A stable bundle identifier
- A root folder
- A set of concept files
- Optional `index.md`
- Optional `log.md`
- Internal link resolution relative to that bundle

Illustrative configuration:

```yaml
okf:
  enabled: auto
  bundles:
    - id: product
      root: content/product
    - id: platform
      root: content/platform
```

### Bundle rules

- Concept IDs must be unique within a bundle.
- Identical concept IDs may exist in different bundles.
- Cross-bundle links should be explicit or configurable.
- Absolute OKF paths should resolve within the current bundle by default.
- The website must not silently resolve a link into another bundle only because a matching path exists.

---

## 8. Concept Identity

Concept identity is one of the most important compatibility requirements.

For an OKF concept:

```text
tables/customer-orders.md
```

The concept ID should be:

```text
tables/customer-orders
```

The display title may be:

```yaml
title: Customer Order Records
```

Changing the title must not change the concept identity.

Recommended separation:

| Property | Meaning |
|---|---|
| Concept ID | Stable bundle-relative path without `.md` |
| File path | Physical source location |
| Display title | Human-readable title |
| Website route | Usually based on concept ID |
| Slug | Optional website-specific override, if explicitly supported |

### Required behavior

- Titles must not silently change OKF concept routes.
- Concept IDs should survive title edits.
- Backlinks should resolve by concept identity.
- Renames should be detectable as path changes, not title changes.
- Explicit route aliases may be added later, but should not replace concept identity.

---

## 9. Reserved Files

### 9.1 `index.md`

`index.md` should act as an authored navigation and landing page.

Recommended behavior:

- Render it as a directory or bundle landing page.
- Preserve headings, descriptions, grouping, and link order.
- Use it as the preferred semantic navigation structure for that scope.
- Supplement it with unlisted child concepts when useful.
- Clearly mark synthesized entries that were not explicitly listed.
- Do not treat it as an ordinary concept node by default.

When no authored index exists, Astro Huge Doc may synthesize one from:

- Filesystem hierarchy
- Concept titles
- Descriptions
- Types
- Tags
- Configured sorting

### 9.2 `log.md`

`log.md` should act as curated knowledge history.

Recommended behavior:

- Render it as a timeline or structured change log.
- Extract dates, categories, and linked concepts when possible.
- Show relevant entries on individual concept pages.
- Keep the raw Markdown page accessible.
- Do not treat it as an ordinary concept node by default.

### 9.3 Other untyped Markdown files

Untyped Markdown files remain normal documentation pages.

They may appear in:

- Filesystem navigation
- Search
- Nearby content
- Authored indexes

They should not automatically become graph nodes unless explicitly configured.

---

## 10. Relationship Semantics

OKF relationships are primarily expressed through Markdown links.

Astro Huge Doc should derive:

- Outgoing concept links
- Incoming links or backlinks
- Unresolved concept references
- External resources
- Local non-concept file references

### Important limitation

A Markdown link does not necessarily define a formal relationship type.

For example:

```md
Revenue is calculated from the [Subscriptions Table](../tables/subscriptions.md).
```

The website can safely infer:

- Source concept
- Target concept
- Link text
- Source heading
- Nearby sentence or paragraph
- Direction

It should not automatically claim:

```text
Revenue DEPENDS_ON Subscriptions Table
```

unless the source content explicitly provides that semantic relation.

### Recommended relationship context

Store or expose:

- Source concept
- Target concept
- Raw link
- Resolved target
- Link text
- Source heading
- Nearby sentence
- Resolution status
- Bundle
- Whether the target is external

This context makes backlinks far more useful than a bare node-edge graph.

---

## 11. Link Resolution Rules

OKF-aware link resolution must distinguish bundle paths from website routes.

Examples:

```md
[Customers](/tables/customers.md)
```

```md
[Customers](../tables/customers.md)
```

The first form should be interpreted as bundle-root-relative.

The second should be interpreted relative to the current concept file.

Concept resolution should conceptually follow:

```text
current bundle
+ source concept path
+ raw Markdown href
→ normalized target concept ID
→ resolved document
→ website URL
```

### Required cases

- Relative Markdown path
- Bundle-root-relative Markdown path
- Anchor-only link
- Link with fragment
- URL-encoded path
- External URL
- Local asset
- Missing target
- Link to `index.md`
- Link to `log.md`
- Cross-bundle target
- Case sensitivity differences across operating systems

### Display behavior

- Resolved concepts should navigate normally.
- Missing concepts should be visibly unresolved.
- External URLs should be marked as external.
- Fragments should preserve heading navigation.
- Source paths should remain inspectable for debugging.

---

## 12. Metadata Presentation

An OKF concept page should have a compact semantic header above or beside the Markdown body.

Example:

```text
Metric

Monthly Recurring Revenue
Recurring subscription revenue normalized monthly.

Tags: revenue · finance · subscription
Resource: Open dashboard
Updated: 12 July 2026
OKF: valid
```

Recommended fields:

- Type
- Title
- Description
- Tags
- Timestamp
- Resource
- Bundle
- Concept ID
- Conformance status

### Additional metadata

Unknown fields can be shown in an expandable panel:

```text
Additional metadata
```

This allows extensions without cluttering every page.

### Display principles

- Do not dump raw YAML by default.
- Keep metadata compact.
- Make concept identity inspectable.
- Use type labels as facets, not as rigid schemas.
- Preserve original values even when grouping values are normalized.

---

## 13. Reading-Centered Relationship UI

The main OKF experience should remain a documentation reader.

Recommended page structure:

```text
Left side:
- Page tree
- Authored index hierarchy
- Type or tag filters

Center:
- Markdown document

Right side:
- On this page
- Related knowledge
- Metadata
```

A switchable right rail can provide:

### On this page

- Heading outline
- Current heading tracking
- Existing Astro Huge Doc TOC behavior

### Related knowledge

- Links to
- Linked from
- Same type
- Shared tags
- Mentioned in indexes
- Mentioned in log
- Unresolved links

Each relationship should include context where possible.

Example:

```text
Subscriptions Table
Referenced under “Calculation”

“MRR is calculated from active subscription rows in…”
```

This is more useful for readers than a graph edge with no explanation.

---

## 14. Graph Experience

A graph is useful, but it should not become the default interface.

### Default graph: local neighborhood

Show:

- Current concept
- Direct outgoing links
- Direct backlinks
- Optional second-degree neighbors
- Grouping by folder, type, or bundle
- Clear distinction between resolved and unresolved nodes

### Optional full graph

Provide a separate explorer for:

- Entire bundle
- Selected type
- Selected tag
- Selected folder
- Search results
- Cross-bundle relationships

### Graph requirements

- Search
- Type filtering
- Tag filtering
- Bundle filtering
- Depth control
- Direction visibility
- Link context on selection
- Large-bundle safeguards
- Accessible non-graph alternative
- Deep link back to normal document pages

### Product position

Astro Huge Doc should not compete by showing the largest possible force-directed graph.

Its advantage should be:

- Better reading
- Better navigation
- Contextual relationships
- Better large-corpus behavior
- Better web deployment
- Better integration with rich Markdown content

---

## 15. Type and Tag Exploration

Generate semantic explorer pages.

Examples:

```text
/explore/types
/explore/types/metric
/explore/types/api-endpoint
/explore/tags/revenue
/explore/bundles/platform
```

Possible views:

- Table
- Cards
- Compact list
- Local graph
- Folder grouping

Useful information:

- Number of concepts
- Recently updated concepts
- Concepts missing descriptions
- Concepts with unresolved links
- Most connected concepts
- Folder distribution
- Tag combinations
- Orphaned concepts
- Concepts not present in authored indexes

### Type normalization

Types may vary in case or formatting.

The website may group similar normalized values while preserving the original source value.

Examples:

```text
API Endpoint
api-endpoint
api endpoint
```

The UI may suggest normalization but should not rewrite source content automatically.

---

## 16. Authored and Synthesized Navigation

Astro Huge Doc already has filesystem navigation. OKF introduces authored semantic navigation.

Both should remain available.

### Authored navigation

Derived from `index.md`:

- Preserves author intent
- Preserves grouping
- Preserves descriptions
- Preserves ordering
- Supports progressive disclosure

### Filesystem navigation

Derived from source folders:

- Complete
- Predictable
- Useful for repository orientation
- Includes non-OKF pages and assets

### Synthesized semantic navigation

Generated when an index is missing or incomplete:

- Group by directory
- Group by type
- Group by tag
- Sort by title, path, timestamp, or configured order
- Mark synthesized sections clearly

### Recommended UI

Allow readers to switch between:

- Contents
- Files
- Types
- Tags

Do not silently replace the filesystem tree with an inferred graph hierarchy.

---

## 17. Search

OKF should improve search ranking and filtering.

Searchable fields may include:

- Title
- Description
- Body text
- Concept ID
- Type
- Tags
- Resource
- Unknown metadata
- Linked concept titles
- Index descriptions
- Log entries

### Search filters

- Bundle
- Type
- Tag
- Folder
- Updated date
- Has backlinks
- Has unresolved links
- Has description
- Reserved file role

### Search result presentation

An OKF result can show:

```text
Monthly Recurring Revenue
metric · finance · revenue

Recurring subscription revenue normalized monthly.

3 backlinks · 2 outgoing concepts
```

Plain Markdown results should remain fully supported.

---

## 18. Validation and Diagnostics

Validation must be tolerant and visible.

Recommended levels:

### Errors

Strong conformance failures, such as:

- A concept expected to be OKF has no usable frontmatter.
- Required concept metadata is missing or empty.
- A reserved file has structurally invalid metadata.
- A configured bundle cannot be resolved.

### Warnings

Quality or integrity issues, such as:

- Missing title
- Missing description
- Invalid timestamp
- Broken internal link
- Duplicate concept identity
- Unknown OKF version
- Empty body
- Unlisted child concept
- Ambiguous cross-bundle target

### Suggestions

Editorial improvements, such as:

- No incoming or outgoing relationships
- No citations
- Very long concept
- Inconsistent tag spelling
- Type differs only by punctuation
- Resource duplicates another concept
- Index description is missing
- Concept is difficult to discover

### Default behavior

- Render the page anyway.
- Do not fail a normal website build for warnings.
- Show a summary in a diagnostics page.
- Show page-specific diagnostics near metadata.
- Allow stricter build behavior only through explicit configuration.

Illustrative configuration:

```yaml
okf:
  validation:
    display: warnings
    fail_build: false
```

---

## 19. Diagnostics Dashboard

A bundle-level diagnostics page could show:

- Total concepts
- Untyped Markdown pages
- Valid concepts
- Concepts with warnings
- Broken internal links
- Unresolved cross-bundle links
- Orphaned concepts
- Concepts not listed in indexes
- Duplicate tags
- Duplicate or near-duplicate types
- Empty descriptions
- Invalid timestamps
- Reserved file status
- Most connected concepts
- Concepts with no backlinks
- Concepts with no outgoing links

This page should be useful for maintainers without affecting readers.

---

## 20. History and `log.md`

`log.md` should provide curated knowledge history.

Possible presentation:

```text
12 July 2026

Creation
Added Customer Lifetime Value.

Update
Clarified revenue-recognition rules.

Deprecation
Replaced Legacy MRR.
```

Potential enhancements:

- Filter by concept
- Filter by category
- Link entries to affected concepts
- Show recent changes on the bundle homepage
- Show related entries on concept pages
- Compare curated log entries with Git history
- Compare curated log entries with stored document versions
- Highlight changes not documented in `log.md`

These deeper history features should be later-stage work.

---

## 21. Citations

A `# Citations` section can receive richer presentation without changing the source Markdown.

Possible citation card:

```text
BigQuery table schema
External source

Used in:
- Schema
- Join examples
```

Desired behavior:

- Internal OKF references open as concept pages.
- External references are clearly marked.
- Broken references remain visible.
- Citation usage can show source heading context.
- Citation cards can be copied or exported.
- Network availability checks remain optional and non-blocking.

---

## 22. Schema and Example Sections

OKF does not replace formal schema languages, but conventional headings can be enhanced.

### `# Schema`

Potential viewer features:

- Sortable tables
- Column filtering
- Sticky headers
- Copy field names
- Link mentioned concepts
- Highlight known types
- Download table as CSV
- Collapse long descriptions
- Show raw Markdown fallback

### `# Examples`

Potential viewer features:

- Copy buttons
- Language grouping
- Expand or collapse
- Deep links
- Reference highlighting
- Related concept links
- Downloadable snippets
- Rendered and raw views where relevant

Enhancements must remain optional and must not reinterpret arbitrary content too aggressively.

---

## 23. Type-Specific Presentation

Known concept types may receive optional visual enhancements.

Examples:

### Metric

- Definition
- Formula
- Owner
- Source systems
- Dimensions
- Related metrics

### Table or dataset

- Schema
- Storage location
- Producers
- Consumers
- Related dashboards

### API endpoint

- Method
- Route
- Request and response examples
- Related service
- Authentication notes

### Policy

- Status
- Scope
- Owner
- Effective date
- Superseded-by relationship

### Playbook

- Preconditions
- Steps
- Escalation path
- Related systems

Important rules:

- Type-specific renderers are plugins or optional enhancements.
- Unknown types always fall back to the generic concept page.
- Type renderers must not require a global ontology.
- Source Markdown remains authoritative.

---

## 24. Agent-Oriented Context Export

OKF semantics can make Astro Huge Doc useful as a context provider for assistants and agents.

Possible page action:

```text
Copy agent context
```

Options:

- Current concept
- Concept plus direct relationships
- Two-hop neighborhood
- Current directory
- Current authored index section
- Current bundle summary

Possible output formats:

- Markdown
- JSON
- Plain text
- Downloadable context pack

Illustrative JSON:

```json
{
  "bundle": "product",
  "concept": {
    "id": "metrics/mrr",
    "type": "metric",
    "title": "Monthly Recurring Revenue"
  },
  "outgoing": [],
  "backlinks": [],
  "citations": [],
  "diagnostics": []
}
```

Potential endpoints:

```text
/api/okf/concepts/{concept-id}
/api/okf/context/{concept-id}?depth=1
/api/okf/search?q=monthly+revenue
/api/okf/bundles/{bundle-id}
```

These APIs should remain optional.

---

## 25. Multiple Repositories and Multiple Bundles

Astro Huge Doc may aggregate content from multiple repositories.

OKF support should preserve repository and bundle boundaries.

Each concept should be able to expose:

- Bundle
- Source repository
- Source path
- Concept ID
- Website path
- Version or commit, when available

Potential views:

- Browse by repository
- Browse by bundle
- Browse all concepts
- Cross-bundle relationships
- Cross-repository references
- Missing external bundle references

### Cross-bundle safety

A link should not resolve into another bundle accidentally.

Possible future explicit syntax or mapping:

```yaml
okf:
  aliases:
    platform: platform-bundle
```

The exact syntax can be decided later.

---

## 26. Large-Bundle Behavior

OKF support should preserve Astro Huge Doc's ability to handle large documentation trees.

Product-level requirements:

- Do not require loading the entire graph on every page.
- Do not compute all backlinks in the browser.
- Do not block the first document render on graph construction.
- Load relationship panels lazily where useful.
- Use neighborhood graphs by default.
- Paginate or virtualize very large type/tag lists.
- Keep full graph exploration separate from normal reading.
- Allow semantic features to be disabled independently.
- Cache derived semantic indexes.
- Preserve static-output compatibility where feasible.

Performance budgets and implementation mechanisms can be defined later.

---

## 27. Accessibility

All OKF features must work without relying only on graph visuals.

Requirements:

- Backlinks available as text lists
- Relationships keyboard-navigable
- Graph has an equivalent list or table
- Types and tags are readable text
- Validation states do not rely only on color
- Metadata panels use semantic HTML
- Search and filters support keyboard use
- Relationship direction is announced clearly
- External and unresolved links are distinguishable

---

## 28. Security and Privacy

Default OKF support should be local and deterministic.

Principles:

- Do not send content to external services for parsing.
- Do not require remote graph services.
- Do not validate external URLs unless explicitly enabled.
- Do not expose local filesystem paths in public builds by default.
- Sanitize metadata and Markdown output consistently.
- Treat `resource` and other URL fields as untrusted input.
- Keep optional APIs disabled or scoped appropriately.
- Preserve existing Astro Huge Doc authentication and deployment behavior.

---

## 29. Illustrative Configuration Surface

The final configuration may differ. This only shows likely product controls.

```yaml
okf:
  enabled: auto

  bundles:
    - id: knowledge
      root: content

  routes:
    use_concept_id: true
    prefix: ""

  navigation:
    authored_indexes: true
    synthesize_missing_indexes: true
    show_unlisted_children: true

  validation:
    display: warnings
    fail_build: false

  graph:
    enabled: true
    default_view: neighborhood
    default_depth: 1
    full_graph: true

  explorer:
    types: true
    tags: true
    recent: true
    diagnostics: true

  history:
    log: true
    git: false
    versions: false

  agent:
    context_export: true
    api: false
```

All sections should be optional.

---

## 30. Proposed Page Surfaces

Potential routes:

```text
/
```

Bundle or site landing page.

```text
/{concept-id}
```

Normal concept page.

```text
/explore
```

Semantic explorer overview.

```text
/explore/types
```

All types.

```text
/explore/types/{type}
```

Concepts of one type.

```text
/explore/tags
```

All tags.

```text
/explore/tags/{tag}
```

Concepts with one tag.

```text
/explore/graph
```

Full graph explorer.

```text
/explore/recent
```

Recent concepts or log entries.

```text
/explore/diagnostics
```

Validation and quality report.

```text
/explore/bundles/{bundle}
```

Bundle overview.

These routes should respect the website base path and static deployment requirements.

---

## 31. Recommended First Release

The first release should be intentionally narrow.

### Minimum useful OKF support

1. Detect typed concepts.
2. Preserve path-based concept identity.
3. Render semantic metadata.
4. Resolve internal concept links.
5. Generate backlinks.
6. Recognize `index.md`.
7. Recognize `log.md`.
8. Provide type and tag filters.
9. Show tolerant validation warnings.
10. Keep plain Markdown behavior unchanged.

### Features to postpone

- Full global graph
- Git-history integration
- Type-specific renderers
- Agent API
- Cross-bundle alias syntax
- External link checking
- Automatic ontology inference
- Visual editing
- Advanced relationship typing

This first release would already make Astro Huge Doc a strong OKF website viewer.

---

## 32. Suggested Delivery Stages

### Stage 1 — Recognition

- Detect OKF concepts
- Define bundle roots
- Establish stable concept IDs
- Recognize reserved files
- Display metadata
- Provide diagnostics

### Stage 2 — Relationships

- Resolve internal links
- Generate backlinks
- Show relationship context
- Add type and tag views
- Identify unresolved targets

### Stage 3 — Navigation

- Parse authored indexes
- Synthesize missing indexes
- Add semantic navigation modes
- Add recent and diagnostics views

### Stage 4 — Exploration

- Add local graph
- Add full graph explorer
- Add graph filters
- Add large-bundle safeguards

### Stage 5 — Knowledge operations

- Parse log timelines
- Integrate versions or Git history
- Add context export
- Add optional semantic APIs
- Add type-specific plugins

---

## 33. Acceptance Criteria

### Backward compatibility

- A repository without OKF metadata renders as before.
- No OKF configuration is required.
- Untyped Markdown pages remain visible.
- Existing page tree and TOC behavior remain usable.

### Concept identity

- A title change does not change the concept ID.
- Internal links resolve by bundle-relative source identity.
- Concept IDs are visible for diagnostics.
- Duplicate concept IDs are reported.

### Metadata

- Type, title, description, tags, timestamp, and resource can be displayed.
- Unknown metadata is preserved.
- Unknown types render through a generic concept page.

### Relationships

- Outgoing concept links are shown.
- Backlinks are shown.
- Broken concept links do not block rendering.
- Relationship context includes at least link text and source location.
- External links are distinguished from internal concepts.

### Reserved files

- `index.md` acts as an authored landing or navigation page.
- Missing indexes can be synthesized.
- `log.md` can be rendered as knowledge history.
- Reserved files are not treated as ordinary concepts by default.

### Validation

- Errors, warnings, and suggestions are distinguishable.
- Warnings do not fail builds by default.
- Page-specific diagnostics are visible.
- Bundle-level diagnostics are available.

### UX

- Readers can navigate without opening a graph.
- Graph information has a text equivalent.
- Type and tag exploration is available.
- Plain Markdown search remains available.
- Semantic features do not obscure the document body.

### Scale

- Normal page rendering does not require loading the full graph.
- Relationship features can be lazy.
- Full graph exploration is separated from normal page rendering.
- Large lists support pagination, filtering, or virtualization.

---

## 34. Open Product Questions

These should be resolved before or during detailed design.

1. Should `auto` detection be enabled by default?
2. What exactly establishes an OKF bundle root?
3. Should a typed file outside a bundle become a one-file bundle?
4. How should website route aliases interact with concept IDs?
5. How should cross-bundle links be expressed?
6. Should untyped Markdown appear in semantic search results by default?
7. Should `index.md` replace or supplement a folder README view?
8. How much relationship context should be stored?
9. Should headings such as `Schema`, `Examples`, and `Citations` be recognized automatically?
10. How should type normalization work without changing source values?
11. Should diagnostics be visible to all readers or only maintainers?
12. Which semantic features must work in static builds?
13. Which features must be available in the VS Code preview?
14. Should agent exports include full source content or bounded excerpts?
15. Should full graph exploration be built in or offered as an optional package?
16. How should concept renames and redirects be handled?
17. Should source repository and commit information appear on public pages?
18. What URL scheme should APIs use when multiple bundles contain the same concept ID?

---

## 35. Recommended Positioning

Astro Huge Doc should not present itself as another graph-first OKF viewer.

Recommended positioning:

> Astro Huge Doc is a documentation-site consumer for OKF, optimized for reading, navigation, deployment, large knowledge bundles, rich Markdown content, and contextual relationships.

Its strongest differentiators can be:

1. Excellent long-form reading
2. Filesystem navigation and per-page TOC
3. Authored and synthesized index navigation
4. Contextual backlinks
5. Local neighborhood graphs
6. Rich assets, diagrams, tables, and examples
7. Multi-repository aggregation
8. SSR, static, local, and VS Code delivery
9. Large-bundle performance
10. Agent-ready context export

---

## 36. Final Recommendation

Implement OKF as a semantic layer over the existing Astro Huge Doc content model.

The integration should follow this hierarchy:

```text
Plain Markdown
    → normal documentation page

Markdown with metadata
    → enriched documentation page

OKF concept
    → semantic metadata, relationships, backlinks, facets

OKF bundle
    → authored indexes, semantic exploration, history, diagnostics

Advanced OKF usage
    → graphs, context exports, optional APIs, type-specific plugins
```

The first milestone should focus on stable identity, metadata, link resolution, backlinks, reserved files, type/tag exploration, and tolerant diagnostics.

That delivers meaningful OKF value without locking the project into premature implementation choices or making OKF adoption mandatory.
