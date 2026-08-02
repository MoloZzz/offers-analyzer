# Data Model: Executable Hybrid Knowledge Vault

This feature adds repository metadata and derived artifacts, not application database entities.
The existing Offers Analyzer domain model remains unchanged.

## Vault configuration

| Field | Meaning | Validation |
|---|---|---|
| `vaultDir` | Curated vault root | Existing repository-relative directory |
| `contextDir` | Decoupled context subdirectory | Located under `vaultDir`; excluded from graph/search |
| `indexNote` | Curated navigation root | Resolves to exactly one curated note |
| `roadmapNote` | Canonical delivery-status note | Resolves to exactly one curated note |
| `codeRoot` | Application source root | Existing repository-relative directory |
| `adapter` | Code-fact extractor | `none` or an explicit adapter module |
| `budget` | Optional runtime-specific context budget | Positive number; never a product/API rate limit |

## Canonical note metadata

| Field | Meaning | Lifecycle |
|---|---|---|
| `title` | Existing human-readable note title | Required by the current vault protocol |
| `type` | Existing note category | Required by the current vault protocol |
| `updated` | Existing ISO update date | Required by the current vault protocol |
| `summary` | Compact retrieval description | Optional, reviewed before adding |
| `code` | Narrow source glob(s) owned by the note | Optional; added only after ownership review |
| `rev` | Digest of the owned source set | Generated/pinned only after a real note edit |

## Context artifacts

| Artifact | Owner | Source of truth | Retention |
|---|---|---|---|
| `context/CURRENT.md` | Current task handoff | Curated notes/specs/ADRs linked from it | Replaced as work focus changes |
| `context/log/*.md` | Historical session record | Historical only | Append-preserving |
| `context/backlog.md` | Legacy planning context | Transitional pointer/history | Retained until deliberate archival |

## Generated artifacts

| Artifact | Inputs | Writer | Consumer |
|---|---|---|---|
| `_gen/context.txt` | Config, canonical notes, roadmap, adapter facts | `vault build` | L1 orientation |
| `_gen/index.json` | Curated note metadata/headings | `vault build` | Retrieval/inspection |
| `_gen/graph.json` | Curated wikilinks only | `vault build` | Graph health |
| `_gen/map.tsv` | Curated note map | `vault build` | Fast navigation |
| `_gen/code-map.txt` | Explicit adapter facts | `vault build` | Code orientation |
| `_gen/facts.txt` | Verified entities, migrations, providers, environment, scripts, tests | `vault build` | Source-fact review |
| `_gen/health.txt` | Curated graph health | `vault build` | Review of graph connectivity; `vault check` reports all rule findings |

## Retrieval baseline row

`_retrieval.tsv` stores `query`, `expected_ref`, and rank mode (`top` or `within`). It contains no
session history or production data. A row is valid only when the expected reference resolves to a
curated note or its stable section.

## Evidence metric row

`_metrics.tsv` stores `key`, `roadmap target`, `trigger`, `question`, and one read-only SQL
statement. Every query returns exactly one numeric `value` and optional numeric sample size `n`.
Measurement output is local and ignored by Git.
