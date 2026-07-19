# Survey of Alternatives and Complements to Open Knowledge Format

**Status date:** 19 July 2026  
**Subject:** Open Knowledge Format (OKF) compared with adjacent standards, protocols, and authoring models  
**Purpose:** Help documentation, wiki, data-platform, and AI-agent teams decide where OKF is the best fit, where another standard is stronger, and which standards should be layered together.

> **Important framing:** Most entries in this survey are not direct replacements for OKF. They address different layers: discovery, semantic modelling, validation, provenance, data packaging, API contracts, or runtime transport. “Better” therefore means *better for the specific concern being evaluated*, not universally better.

---

## Decision summary

| Alternative or complement | Role relative to OKF | Main overlap | Main advantage over OKF | Main disadvantage relative to OKF | Practical verdict |
|---|---|---|---|---|---|
| **Knowledge Context Protocol (KCP)** | Closest direct alternative | Agent-readable knowledge navigation and metadata | Rich routing, audience, freshness, dependency, trust, and governance metadata | More manifest complexity and central coordination | Prefer KCP for sophisticated agent routing; prefer OKF for a simple canonical knowledge corpus; they can coexist |
| **llms.txt** | Discovery complement and partial substitute | Helps agents locate useful website knowledge | Extremely easy to publish and consume | Flat index; weak semantics, governance, and content packaging | Publish alongside OKF, not instead of it |
| **Plain Markdown wiki / Obsidian-style vault** | Practical predecessor | Markdown files, folders, links, Git-friendly authoring | Near-zero adoption friction and broad editor support | No shared conformance model or portable meaning | Use for purely local knowledge; adopt OKF when interchange matters |
| **RDF + JSON-LD** | Formal semantic alternative and export target | Represents entities and relationships | Global identifiers, typed edges, graph merging, queryability, formal semantics | Considerably harder to author and operate | RDF/JSON-LD is better for semantic integration; OKF is better for human-first knowledge authoring |
| **OWL + SHACL** | Ontology and validation layer | Types, constraints, and knowledge-model quality | Strong formal validation and reasoning | High expertise and modelling cost | Use when correctness and machine validation matter; layer above or beside OKF |
| **SKOS** | Vocabulary and taxonomy complement | Concepts, labels, broader/narrower relationships | Mature controlled-vocabulary semantics | Does not package narrative operational knowledge | Use SKOS for shared vocabularies referenced from OKF |
| **Schema.org** | Public-web discovery complement | Describes pages, entities, documents, and organizations | Strong web ecosystem and search-engine compatibility | Limited fit for private operational knowledge and long-form context | Generate Schema.org markup from public OKF content |
| **DCAT 3** | Data-catalogue alternative/complement | Dataset and catalogue metadata | Mature dataset discovery and federation model | Narrower than general organizational knowledge | Use DCAT for datasets; use OKF for business context surrounding them |
| **Frictionless Data Package** | Data-packaging complement | Portable bundles with metadata and resources | Better checksums, schemas, tabular-data packaging, and reproducibility | Not designed for interlinked narrative knowledge | Package data with Frictionless; explain it with OKF |
| **OpenAPI** | Domain-specific contract complement | Structured technical knowledge about APIs | Executable, precise HTTP API contracts and mature tooling | Poor fit for rationale, policy, examples, and cross-domain knowledge | Keep OpenAPI authoritative; use OKF for the human and agent context around it |
| **Model Context Protocol (MCP)** | Runtime delivery complement | Makes knowledge available to AI agents | Standardized client-server access to resources and tools | Not an at-rest authoring or interchange format | Store knowledge as OKF; serve selected knowledge through MCP |
| **W3C PROV / PROV-O** | Provenance complement | Sources, derivation, authorship, and lineage | Formal, interoperable provenance representation | Too heavy for basic authoring; does not define the knowledge payload | Add PROV-compatible provenance where auditability matters |
| **Holon Graph / DataBook direction** | Emerging federated alternative | Markdown, graphs, provenance, federated knowledge | Ambition for stronger federation and semantic grounding | Very early, evolving, and substantially more complex | Watch and experiment; do not replace a simple OKF implementation yet |

---

## Overall conclusion

There is currently no single mature standard that is simply “OKF, but better in every respect.”

The closest direct challenger is **KCP**, because it also tries to make a collection of knowledge units efficiently navigable by agents. KCP places substantially more routing and governance information in a `knowledge.yaml` manifest. OKF instead standardizes a permissive directory of Markdown concept documents with YAML frontmatter and ordinary links.

The broader standards landscape suggests a layered architecture rather than a winner-take-all choice:

```text
Human-authored canonical knowledge
        ↓
OKF Markdown bundle
        ↓
Optional KCP navigation and governance manifest
        ↓
Optional RDF / SKOS / PROV semantic profile
        ↓
MCP runtime delivery
        ↓
llms.txt and Schema.org public discovery
```

For a zero-configuration documentation or wiki website, **OKF is the most natural canonical input format** among the options surveyed. It preserves the existing Markdown experience while introducing enough structure to support richer navigation, filtering, graph views, agent consumption, validation, and export.

---

# Detailed comparisons

## 1. Knowledge Context Protocol

### What it is

The **Knowledge Context Protocol (KCP)** defines a structured knowledge manifest, normally named `knowledge.yaml`. The manifest describes knowledge units and provides metadata that helps an agent decide what to load, for which intent, in what order, for which audience, and under which freshness or governance constraints.

Despite its name, KCP is primarily a static format specification rather than a network protocol. A Git repository or static documentation site can be KCP-compliant without running a server.

### Overlap with OKF

KCP and OKF both attempt to make organizational or project knowledge:

- portable;
- inspectable in source control;
- usable by humans and AI agents;
- incrementally loadable instead of copied into one large context;
- compatible with ordinary documentation repositories.

Both can describe a corpus of Markdown documents. Both are intended to reduce blind file searching and indiscriminate context loading.

### Advantages over OKF

KCP is stronger when an agent needs an explicit routing map. Its manifest can express concepts such as:

- knowledge-unit intent;
- trigger terms and expected questions;
- loading priority;
- audience;
- dependencies;
- freshness;
- scope;
- trust and access considerations;
- relationships between units;
- federation across manifests.

This can make KCP more efficient for large corpora and multi-agent systems because the agent can inspect one compact manifest before loading content.

KCP also separates navigation metadata from the documents themselves. That is useful when the same documents must be routed differently for different applications or audiences.

### Disadvantages relative to OKF

A central manifest introduces coordination and maintenance costs:

- the manifest can drift from the documents;
- merges may become contentious;
- generated and hand-maintained fields may conflict;
- large manifests can become another catalogue that must be governed;
- content is less self-describing when removed from the manifest.

OKF’s per-document frontmatter is less expressive but more portable at the individual-file level. A concept document still carries its basic identity when copied, viewed, or processed independently.

KCP also asks authors or tooling to understand a richer schema earlier in the adoption process. OKF can be adopted by adding only a required `type` field to otherwise ordinary Markdown.

### Which is better?

**KCP is better when:**

- agent routing efficiency is a primary concern;
- the corpus is large;
- loading order and dependencies matter;
- different audiences need different views;
- freshness and governance metadata must be explicit;
- a generated manifest can be kept synchronized reliably.

**OKF is better when:**

- humans remain the primary authors;
- zero-configuration adoption matters;
- individual documents should remain self-describing;
- the corpus is also a normal documentation website;
- permissive interoperability is more valuable than strict routing metadata.

### Recommended relationship

Do not force an exclusive choice. An effective combination is:

1. Keep the actual knowledge in OKF-compatible Markdown files.
2. Generate `knowledge.yaml` from the parsed OKF corpus.
3. Allow manual KCP overrides only for routing and governance fields that cannot be inferred.
4. Validate the manifest against the current files during CI.
5. Serve KCP-selected OKF documents through MCP when runtime access is needed.

This gives humans a simple authoring surface while agents receive a richer map.

### Sources

- [KCP specification repository](https://github.com/cantara/knowledge-context-protocol)
- [KCP specification overview](https://www.neura.market/directories/md-directory/spec-md-knowledge-context-protocol-spec-monrh2ha)
- [KCP and MCP relationship](https://wiki.totto.org/blog/2026/02/28/kcp-and-mcp-one-protocol-for-structure-one-for-retrieval/)
- [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

---

## 2. llms.txt

### What it is

`llms.txt` is a proposed convention for publishing a concise, Markdown-formatted index at a predictable website location. It provides background, guidance, and links to pages that an LLM-oriented client may find useful.

It is primarily a discovery surface, comparable to a curated table of contents for machine consumers.

### Overlap with OKF

Both approaches try to make existing web or documentation content easier for AI systems to discover and consume. Both prefer readable text over opaque binary packaging.

An OKF website and an `llms.txt` file may point to many of the same pages.

### Advantages over OKF

`llms.txt` is easier to deploy:

- one file;
- no per-document frontmatter requirement;
- no bundle rules;
- no special directory layout;
- straightforward generation from an existing site map.

It is appropriate when the only goal is to tell an agent, “These are the important pages.”

### Disadvantages relative to OKF

It does not meaningfully standardize the knowledge itself. It offers little support for:

- concept types;
- document-level metadata;
- graph relationships;
- provenance;
- bundle exchange;
- validation;
- local/offline use;
- incremental transformation into a richer knowledge system.

A link list also becomes weak at scale. It can identify documents, but it does not provide enough structure to decide precisely which concepts should be loaded for a question.

### Which is better?

**llms.txt is better for website discovery.**

**OKF is better for representing and exchanging the underlying knowledge corpus.**

### Recommended relationship

Generate `llms.txt` automatically from the public portion of an OKF bundle. The file should link to:

- the bundle entry point;
- important concept pages;
- generated topic indexes;
- machine-readable exports;
- validation or version information.

`llms.txt` should be treated as the front door, not the filing system.

### Sources

- [llms.txt proposal](https://llmstxt.org/)
- [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

---

## 3. Plain Markdown wiki or Obsidian-style vault

### What it is

A plain Markdown wiki is a folder tree containing Markdown files, links, images, and sometimes YAML frontmatter. Obsidian vaults, Git-based internal wikis, MkDocs repositories, Hugo content trees, and many developer-documentation repositories already follow this model.

This is the practical predecessor from which OKF draws much of its usability.

### Overlap with OKF

The overlap is very high:

- Markdown documents;
- directory-based organization;
- ordinary links;
- YAML frontmatter;
- Git compatibility;
- human-readable source;
- local-first editing;
- static-site generation.

In many cases, converting a Markdown wiki into minimal OKF requires only frontmatter normalization and a few naming conventions.

### Advantages over OKF

Plain Markdown has almost no standard-adoption cost:

- every editor supports it;
- existing sites already render it;
- authors need not learn a specification;
- content can follow any local convention;
- there is no conformance burden.

For a single team using one toolchain, local conventions may be entirely sufficient.

### Disadvantages relative to OKF

The same flexibility prevents reliable interoperability. A consumer cannot safely assume:

- where metadata lives;
- which field identifies the document type;
- whether index files have special meaning;
- how relationships should be interpreted;
- whether unknown fields are permitted;
- what a “bundle” includes;
- how conformance should be tested.

Two Markdown repositories may look similar while requiring completely different parsers.

### Which is better?

**Plain Markdown is better when:**

- one team owns both authorship and rendering;
- there is no interchange requirement;
- the repository is small;
- local conventions are stable;
- maximum flexibility matters.

**OKF is better when:**

- bundles move between systems;
- multiple viewers or agents must understand the same corpus;
- validation and tooling should be reusable;
- a website should expose a predictable machine-readable structure.

### Recommended relationship

Treat OKF as a compatibility profile for Markdown rather than a replacement for Markdown.

An OKF-aware viewer should still render non-OKF Markdown normally. It should progressively enable richer behavior when frontmatter and bundle conventions are present.

That progressive-enhancement model is especially appropriate for zero-configuration documentation generators.

### Sources

- [OKF specification: relationship to existing wiki repositories](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [Obsidian](https://obsidian.md/)
- [Hugo proposal for OKF support](https://github.com/gohugoio/hugo/issues/15035)

---

## 4. RDF and JSON-LD

### What they are

**RDF** is a graph data model built around statements expressed as subject–predicate–object triples. **JSON-LD** is a JSON-based serialization for Linked Data.

Together they support globally identified entities, typed relationships, graph merging, shared vocabularies, and standardized query or reasoning systems.

### Overlap with OKF

Both can represent:

- concepts;
- metadata;
- relationships;
- links to external resources;
- structured organizational knowledge.

An OKF document can be interpreted as a node, while Markdown links can be interpreted as graph edges.

### Advantages over OKF

RDF and JSON-LD provide formal semantic interoperability:

- globally unique IRIs;
- typed predicates;
- explicit vocabularies;
- graph composition across organizations;
- SPARQL querying;
- compatibility with ontology and reasoning tools;
- clearer distinction between identity, labels, and relationships.

OKF Markdown links indicate that some relationship exists, but the base specification does not assign a formal relationship type. RDF can state exactly whether one concept depends on, supersedes, derives from, owns, or is part of another.

### Disadvantages relative to OKF

RDF carries a much higher usability and implementation cost:

- ontology and vocabulary design;
- IRI management;
- serialization choices;
- graph-store operation;
- shape validation;
- more specialized tooling;
- less approachable manual authoring.

Narrative knowledge is also awkward when forced entirely into triples. Most organizational knowledge still benefits from prose, examples, tables, diagrams, and flexible sections.

### Which is better?

**RDF/JSON-LD is better for:**

- cross-system entity integration;
- formal graph semantics;
- typed relationships;
- federation;
- semantic search and reasoning;
- durable machine identifiers.

**OKF is better for:**

- authoring by subject-matter experts;
- documentation websites;
- operational explanations;
- examples and long-form context;
- Git review;
- low-friction adoption.

### Recommended relationship

Use OKF as the source authoring format and provide an optional semantic export or profile:

- map each concept document to an IRI;
- map `type` values to RDF classes;
- map selected frontmatter keys to predicates;
- map links to a generic relationship by default;
- allow optional typed-link metadata;
- preserve the Markdown body as a literal or linked document representation.

This avoids making semantic-web expertise mandatory while leaving a path to formal integration.

### Sources

- [RDF 1.2 Concepts and Abstract Data Model](https://www.w3.org/TR/rdf12-concepts/)
- [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [OKF semantic-web profile proposal](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/141)

---

## 5. OWL and SHACL

### What they are

**OWL** is an ontology language used to define classes, properties, logical restrictions, and machine-inferable relationships. **SHACL** defines shapes and constraints for validating RDF graphs.

They occupy a different level from OKF: they govern formal meaning and correctness rather than human-readable bundle layout.

### Overlap with OKF

There is partial overlap around:

- concept types;
- permitted metadata;
- relationship expectations;
- validation;
- conformance profiles.

An organization that defines OKF types such as `Metric`, `Dataset`, `Policy`, and `Service` may eventually want formal rules about their required fields and allowed relationships.

### Advantages over OKF

OWL and SHACL can express rules the base OKF specification deliberately avoids, such as:

- every metric must have an owner;
- every dataset must link to a system of record;
- a deprecated concept must identify its replacement;
- a policy cannot be both active and retired;
- a relationship target must have an expected class;
- a value must follow a datatype or pattern.

SHACL validation can produce precise, machine-readable conformance reports.

### Disadvantages relative to OKF

The cost is substantial:

- ontology design expertise;
- formal modelling decisions;
- RDF conversion or native RDF storage;
- stricter governance;
- more difficult authoring;
- risk of modelling debates overtaking practical documentation.

Formal rules can also make early-stage knowledge capture slower. OKF’s permissiveness is useful when the knowledge model is still evolving.

### Which is better?

**OWL/SHACL is better when the organization must prove structural or semantic correctness.**

**OKF is better as the broad authoring and interchange baseline.**

### Recommended relationship

Introduce formal validation in stages:

1. Validate base OKF syntax.
2. Add a lightweight organizational frontmatter schema.
3. Add profile-specific rules for critical concept types.
4. Export to RDF.
5. Apply SHACL only where formal graph validation adds measurable value.

Do not require every document author to understand OWL or SHACL.

### Sources

- [OWL 2 overview](https://www.w3.org/TR/owl2-overview/)
- [SHACL](https://www.w3.org/TR/shacl/)
- [SHACL 1.2](https://www.w3.org/TR/shacl12-core/)

---

## 6. SKOS

### What it is

The **Simple Knowledge Organization System (SKOS)** is a W3C model for controlled vocabularies, thesauri, classification schemes, and taxonomies.

It represents concepts and relationships such as:

- preferred labels;
- alternative labels;
- broader concepts;
- narrower concepts;
- related concepts;
- membership in a concept scheme.

### Overlap with OKF

Both can represent named concepts and links among them. An OKF bundle may contain glossaries, domain terms, classifications, product taxonomies, or business vocabularies.

### Advantages over OKF

SKOS gives shared, interoperable meaning to vocabulary relationships. In a plain OKF bundle, a link between two glossary pages does not inherently say whether one term is broader, narrower, synonymous, deprecated, or merely related.

SKOS is especially strong for multilingual labels and vocabulary mapping between organizations.

### Disadvantages relative to OKF

SKOS is intentionally narrow. It does not provide a natural container for:

- runbooks;
- architecture decisions;
- policy explanations;
- examples;
- tutorials;
- operational context;
- arbitrary document collections.

It also inherits the tooling and authoring complexity of RDF.

### Which is better?

**SKOS is better for controlled vocabularies and taxonomies.**

**OKF is better for the wider knowledge corpus in which those vocabularies are explained and used.**

### Recommended relationship

Allow OKF concept types to declare SKOS-compatible fields or export mappings:

```yaml
type: BusinessTerm
preferred_label: Customer lifetime value
alternative_labels:
  - CLV
  - LTV
broader:
  - finance/customer-value.md
related:
  - metrics/customer-acquisition-cost.md
```

The website can provide a friendly authoring and browsing experience, while an exporter emits formal SKOS.

### Sources

- [SKOS Simple Knowledge Organization System Reference](https://www.w3.org/TR/skos-reference/)

---

## 7. Schema.org

### What it is

**Schema.org** is a collaborative vocabulary for structured data on public web pages. It is commonly embedded using JSON-LD and consumed by search engines and other web systems.

### Overlap with OKF

Both can describe:

- organizations;
- people;
- products;
- documents;
- datasets;
- articles;
- software;
- how-to content;
- relationships between web resources.

For a public OKF-powered website, many concept types may map to Schema.org types.

### Advantages over OKF

Schema.org has a large public-web ecosystem:

- mature vocabulary;
- widespread CMS support;
- search-engine documentation;
- validators;
- established JSON-LD embedding patterns;
- direct association with web-page discoverability.

It is better suited to describing what a public page represents.

### Disadvantages relative to OKF

Schema.org is not a general organizational knowledge-bundle format. It does not provide:

- a directory-level packaging model;
- progressive disclosure through indexes;
- a Markdown authoring convention;
- a local knowledge corpus;
- Git-native curation;
- agent-oriented bundle interchange.

Its vocabulary can also be too generic for internal business semantics.

### Which is better?

**Schema.org is better for public web structured data.**

**OKF is better for portable, human-maintained organizational knowledge.**

### Recommended relationship

Generate JSON-LD from public OKF pages:

- map `type` to a Schema.org type when a safe mapping exists;
- preserve canonical URLs;
- emit authorship and publication metadata;
- connect related concepts;
- expose datasets, software, articles, and organizations using established types.

Do not force all internal OKF types into Schema.org. Use mappings only where the public vocabulary is semantically appropriate.

### Sources

- [Schema.org](https://schema.org/)
- [Schema.org documentation](https://schema.org/docs/documents.html)

---

## 8. DCAT 3

### What it is

The **Data Catalog Vocabulary (DCAT)** is a W3C standard for describing catalogues, datasets, data services, and distributions. DCAT 3 supports interoperable dataset discovery and federation across catalogues.

### Overlap with OKF

OKF originated partly from data-catalogue and organizational-context use cases. Both can describe:

- datasets;
- data products;
- owners and publishers;
- documentation;
- access locations;
- related resources;
- update information.

### Advantages over OKF

DCAT is much stronger for formal dataset catalogue interchange:

- standard dataset and distribution concepts;
- catalogue federation;
- machine-readable access-service descriptions;
- established government and open-data usage;
- alignment with RDF and linked-data ecosystems.

A data portal exporting DCAT can be consumed by catalogue harvesters without inventing a custom mapping.

### Disadvantages relative to OKF

DCAT is narrower and less author-friendly. It is not designed to hold arbitrary organizational knowledge such as:

- metric calculation rationale;
- operational runbooks;
- architectural context;
- troubleshooting notes;
- policy interpretation;
- narrative examples.

It normally requires RDF-oriented tooling.

### Which is better?

**DCAT is better for publishing and federating dataset catalogue metadata.**

**OKF is better for the surrounding human and agent context.**

### Recommended relationship

Treat DCAT records as authoritative for catalogue-level dataset metadata and generate OKF concept pages that:

- summarize the dataset;
- explain business meaning;
- link to dashboards and policies;
- document caveats;
- reference the DCAT identifier;
- add cross-domain context.

An OKF viewer can also ingest DCAT and materialize readable concept pages.

### Sources

- [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/)

---

## 9. Frictionless Data Package

### What it is

The **Frictionless Data Package** specification describes a portable package containing data resources and a `datapackage.json` descriptor. Related specifications cover tabular schemas, field types, resource metadata, hashes, and data validation.

### Overlap with OKF

Both define portable directory-oriented packages with metadata and referenced resources. Both can be checked into source control and transferred between systems.

### Advantages over OKF

Frictionless is substantially better for actual data delivery:

- tabular schemas;
- typed fields;
- data resource paths;
- checksums;
- byte sizes;
- dialects;
- reproducibility;
- validation of packaged datasets.

It answers, “What files are in this data package, and how should their structure be interpreted?”

### Disadvantages relative to OKF

It does not attempt to represent a broad interlinked knowledge corpus. Narrative context is normally limited to metadata fields or separate documentation.

It is not intended to model relationships among policies, people, concepts, services, decisions, and operational procedures.

### Which is better?

**Frictionless is better for packaging data.**

**OKF is better for packaging knowledge about the data and its organizational use.**

### Recommended relationship

Use both in the same repository:

```text
customer-analysis/
├── datapackage.json
├── data/
│   ├── customers.csv
│   └── segments.csv
└── knowledge/
    ├── index.md
    ├── customer.md
    ├── segmentation-method.md
    └── privacy-policy.md
```

The OKF documents should link to the Frictionless package and explain its meaning, provenance, limitations, and use.

### Sources

- [Data Package specification](https://specs.frictionlessdata.io/data-package/)
- [Frictionless Standards](https://specs.frictionlessdata.io/)

---

## 10. OpenAPI

### What it is

The **OpenAPI Specification** defines a language-neutral description format for HTTP APIs. It describes operations, parameters, request bodies, responses, authentication, schemas, and reusable components.

### Overlap with OKF

An OKF corpus may document APIs, services, resources, authentication concepts, and operational usage. Both formats may include examples and links.

### Advantages over OKF

OpenAPI is far more precise and executable for APIs:

- client and server generation;
- validation;
- interactive API explorers;
- contract testing;
- request and response schemas;
- authentication declarations;
- operation-level identifiers;
- mature editor and linting ecosystems.

An OKF page cannot replace a machine-enforceable API contract.

### Disadvantages relative to OKF

OpenAPI is poor at capturing the larger body of knowledge around an API:

- why it exists;
- when not to use it;
- business policy;
- architectural rationale;
- migration decisions;
- operational incidents;
- cross-service workflows;
- domain vocabulary.

Large prose sections inside OpenAPI descriptions also reduce contract readability.

### Which is better?

**OpenAPI is better for the API contract.**

**OKF is better for the knowledge system around the contract.**

### Recommended relationship

Keep OpenAPI as the source of truth and reference it from OKF:

- one OKF concept per service or major domain;
- generated operation summaries where useful;
- links to the authoritative OpenAPI document;
- examples and troubleshooting guides;
- architecture decisions;
- ownership and lifecycle context.

An OKF-aware website can embed an OpenAPI renderer without converting the entire contract into Markdown.

### Sources

- [OpenAPI Specification](https://spec.openapis.org/)
- [OpenAPI 3.2.0](https://spec.openapis.org/oas/v3.2.0.html)
- [OKF specification: domain schemas are out of scope to replace](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

---

## 11. Model Context Protocol

### What it is

The **Model Context Protocol (MCP)** is a client-server protocol through which AI applications can discover and access resources, prompts, and tools.

It standardizes runtime interaction rather than static content authoring.

### Overlap with OKF

Both are intended to make knowledge available to agents. An MCP server may expose:

- Markdown documents;
- database metadata;
- knowledge-graph queries;
- search;
- generated summaries;
- individual OKF concept documents.

### Advantages over OKF

MCP provides capabilities that a static bundle cannot:

- dynamic authorization;
- runtime discovery;
- remote access;
- selective resource retrieval;
- tools and actions;
- parameterized queries;
- server-side filtering;
- integration with agent clients.

It is appropriate when the corpus is too large, sensitive, or dynamic to hand directly to the agent.

### Disadvantages relative to OKF

MCP does not solve the at-rest knowledge-model problem. Two MCP servers can expose completely different resource structures and metadata conventions.

Without an underlying content standard, moving the knowledge to another server or static environment remains difficult.

MCP also introduces operational and security concerns that a static bundle avoids:

- server availability;
- authentication;
- permissions;
- prompt injection through remote resources;
- tool safety;
- version compatibility.

### Which is better?

This is not an either-or comparison.

**MCP is better for runtime access.**

**OKF is better for portable at-rest representation and human authoring.**

### Recommended relationship

Use OKF as the durable source and MCP as a delivery adapter:

1. Parse and validate the OKF bundle.
2. Build an index.
3. Expose concept documents as MCP resources.
4. Add search and graph traversal as MCP tools.
5. Enforce access rules at the server.
6. Return original source links and metadata with each result.

### Sources

- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP server resources](https://modelcontextprotocol.io/specification/2025-06-18/server/index)
- [AWS sample: OKF served over MCP](https://github.com/aws-samples/sample-okf-llm-wiki)

---

## 12. W3C PROV and PROV-O

### What they are

The **W3C PROV** family models provenance: entities, activities, agents, derivations, generation, attribution, revision, and related lineage information. **PROV-O** expresses the model as an OWL ontology.

### Overlap with OKF

OKF documents may contain:

- citations;
- timestamps;
- source links;
- authorship;
- update logs;
- generated knowledge;
- derived summaries.

These are all provenance-related concerns, but the base OKF specification does not define a complete provenance model.

### Advantages over OKF

PROV provides formal answers to questions such as:

- Who or what generated this knowledge?
- Which source entities were used?
- Which activity transformed the source?
- Is this document a revision of another entity?
- Which agent was responsible?
- When did generation and invalidation occur?

This matters for regulated, scientific, safety-critical, or auditable knowledge systems.

### Disadvantages relative to OKF

PROV is not a human knowledge authoring format. It describes lineage around entities but not the narrative payload itself.

Full provenance graphs can also be verbose and expensive to maintain. Requiring them for every casual wiki edit would damage usability.

### Which is better?

**PROV is better for formal lineage and auditability.**

**OKF is better for authoring and packaging the knowledge being traced.**

### Recommended relationship

Adopt a graduated provenance model:

- basic: `source`, `author`, `timestamp`;
- intermediate: `generated_by`, `derived_from`, `reviewed_by`, `valid_from`, `valid_until`;
- advanced: export those fields into a PROV-O graph.

The Markdown document should remain readable even when the provenance extension is ignored.

### Sources

- [PROV-O: The PROV Ontology](https://www.w3.org/TR/prov-o/)
- [PROV overview](https://www.w3.org/TR/prov-overview/)

---

## 13. Holon Graph and DataBook direction

### What it is

The emerging **W3C Holon Graph Community Group** is exploring a federated graph architecture, holon envelopes, ontology, provenance, and a Markdown-oriented DataBook substrate for grounding and LLM integration.

This work is early and should be treated as an evolving direction rather than a stable replacement standard.

### Overlap with OKF

The overlap is conceptually significant:

- human-readable knowledge artifacts;
- Markdown as an authoring substrate;
- graph relationships;
- machine grounding;
- provenance;
- federation;
- use by AI systems.

The Holon direction appears to address several concerns deliberately left outside OKF’s minimal core.

### Advantages over OKF

The intended architecture is more ambitious:

- first-class federation;
- explicit semantic grounding;
- envelope-level metadata;
- provenance;
- graph-native composition;
- decentralized knowledge exchange.

If these ideas mature, they may provide a stronger model for knowledge moving across organizational boundaries.

### Disadvantages relative to OKF

The direction is currently:

- early;
- complex;
- subject to change;
- dependent on semantic-web concepts;
- short on mature interoperable tooling;
- unsuitable as a zero-configuration baseline today.

A documentation website should not require users to understand a federated graph architecture before rendering Markdown.

### Which is better?

**Holon/DataBook may eventually be better for federated, provenance-rich semantic knowledge networks.**

**OKF is currently better for practical adoption, simple authoring, and immediate website integration.**

### Recommended relationship

Keep the core architecture extensible:

- stable concept identifiers;
- optional typed relationships;
- provenance hooks;
- import/export interfaces;
- external bundle references;
- no assumption that all knowledge lives in one repository.

This preserves a future migration or interoperability path without coupling the website to an immature model.

### Sources

- [W3C Holon Graph Community Group](https://www.w3.org/community/holon/)
- [Holon Community Group repository](https://github.com/w3c-cg/holon)
- [OKF semantic-web profile proposal](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/141)

---

# Evaluation by concern

## Best option for human authoring

1. Plain Markdown
2. OKF
3. KCP combined with Markdown
4. Schema.org or JSON-LD embedded through generated output
5. RDF/OWL authored directly

OKF’s advantage is that it adds portable structure without abandoning the familiar Markdown workflow.

## Best option for agent navigation

1. KCP for explicit routing metadata
2. OKF with generated indexes and search
3. MCP when the knowledge must be queried dynamically
4. llms.txt for small public websites
5. Plain Markdown without a generated index

A strong implementation can derive much of a KCP-like navigation layer from an OKF bundle.

## Best option for formal semantics

1. RDF + OWL
2. SKOS for vocabularies
3. DCAT for dataset catalogues
4. Schema.org for public-web entities
5. OKF with a semantic profile

OKF should not attempt to recreate the whole semantic-web stack inside YAML frontmatter.

## Best option for validation

1. SHACL for RDF graphs
2. OpenAPI for HTTP API contracts
3. Frictionless schemas for tabular data packages
4. profile-specific OKF validation
5. base OKF validation

Base OKF conformance is intentionally permissive. Stronger validation should be provided through optional profiles.

## Best option for provenance

1. W3C PROV / PROV-O
2. domain-specific lineage systems
3. extended OKF provenance fields
4. basic citations and timestamps
5. unstructured prose only

A practical OKF website should surface provenance clearly even when it does not implement full PROV.

## Best option for public discovery

1. Schema.org
2. standard HTML metadata and sitemaps
3. llms.txt
4. public OKF endpoints
5. MCP, which is primarily a runtime integration rather than a general web-discovery mechanism

The best public site can generate all of the first four from one OKF-compatible corpus.

---

# Recommended architecture for an OKF-aware documentation website

## Canonical content

Keep Markdown as the canonical source. Do not require OKF conformance merely to render a site.

When a document contains valid OKF frontmatter, enable additional behavior.

## Progressive enhancements

An OKF-aware viewer can add:

- concept-type badges;
- metadata panels;
- resource and source links;
- filtered navigation by type or tag;
- bundle-level index pages;
- backlinks;
- related-concept panels;
- graph visualization;
- orphan and broken-link reports;
- freshness indicators;
- provenance display;
- machine-readable concept endpoints;
- JSON-LD export;
- `llms.txt` generation;
- MCP resource serving;
- optional KCP manifest generation.

## Optional profiles

Avoid putting all advanced requirements into the base OKF reader. Define optional profiles, for example:

- `okf-basic`: base v0.1 conformance;
- `okf-docs`: title, description, navigation, and display conventions;
- `okf-governed`: owner, lifecycle, validity, and provenance fields;
- `okf-semantic`: identifiers and typed relationships;
- `okf-data`: dataset and metric conventions;
- `okf-api`: links to authoritative OpenAPI contracts;
- `okf-public-web`: Schema.org and discovery mappings.

## Generated compatibility outputs

From one parsed corpus, the website can generate:

```text
/llms.txt
/sitemap.xml
/okf/index.json
/okf/graph.json
/okf/knowledge.yaml
/okf/schemaorg/*.jsonld
/okf/provenance/*.jsonld
```

This makes OKF a useful authoring centre without claiming that it replaces the surrounding standards.

## Recommended default position

For an Astro-based zero-configuration Markdown website:

- **Render every Markdown repository.**
- **Recognize OKF automatically.**
- **Never require OKF.**
- **Use OKF metadata to improve navigation and understanding.**
- **Generate KCP, llms.txt, Schema.org, and graph exports where useful.**
- **Keep OpenAPI, DCAT, Frictionless, SKOS, and PROV as authoritative specialized standards.**
- **Use MCP only as an optional runtime delivery layer.**

---

# Final judgement

OKF’s strongest quality is not semantic power. It is the unusually low distance between an ordinary documentation repository and an interoperable knowledge bundle.

That makes it a good centre for a documentation website, especially one whose existing promise is “point at a Markdown folder and get a complete site.”

The competing standards become most valuable when treated as specialized layers:

- **KCP** adds agent routing and governance.
- **llms.txt** adds simple discovery.
- **RDF, JSON-LD, OWL, SHACL, and SKOS** add formal semantics and validation.
- **Schema.org** adds public-web structured data.
- **DCAT** adds catalogue federation.
- **Frictionless** adds reliable data packaging.
- **OpenAPI** adds executable API contracts.
- **MCP** adds runtime access.
- **PROV-O** adds formal lineage.
- **Holon/DataBook** points toward future federated knowledge architectures.

The practical strategy is therefore:

> **Use OKF as the optional canonical knowledge profile for Markdown, then generate or connect the specialized standards rather than trying to replace them.**
