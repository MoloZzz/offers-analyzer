# Feature Specification: Executable Hybrid Knowledge Vault

**Feature Branch**: `012-executable-vault`  
**Created**: 2026-08-02  
**Status**: Implemented  
**Input**: Adopt the strongest parts of the current Offers Analyzer second brain and the
`ai-infra` executable-vault donor without importing another product's facts or workflow.

## User Scenarios & Testing

### User Story 1 - Retrieve only the context needed for a task (Priority: P1)

An agent starting a task can obtain a compact, current project brief, locate a relevant curated
note, and read just the needed section before opening source code. It does not have to load the
whole vault or rely on a broad code search.

**Why this priority**: Fast, bounded retrieval is the main benefit missing from the existing
hand-linked vault, while its curated meaning and MOC navigation must be preserved.

**Independent Test**: Regenerate the derived context and use the retrieval commands for a fixed
baseline of domain, decision, operational, and source-code queries; each returns the expected
curated note or code-map entry.

**Acceptance Scenarios**:

1. **Given** a current generated vault, **When** an agent asks about the monthly API budget,
   **Then** it can locate and show the relevant decision/plan section without reading unrelated
   notes.
2. **Given** an agent is about to edit source code, **When** it requests a task brief, **Then**
   it receives the compact project context plus only explicitly requested note sections and a
   generated source map.
3. **Given** a query has Ukrainian or English terminology, **When** it is searched, **Then** the
   configured synonyms can locate the same canonical concept.

---

### User Story 2 - Keep durable product truth and task status unambiguous (Priority: P1)

A contributor can determine the current product vision, requirements, invariants, decision
history, and roadmap status from one canonical place for each concern. Session notes remain
available as an inbox/history but cannot quietly become a competing source of truth.

**Why this priority**: Retrieval only helps if it retrieves healthy information. The donor's
single status owner and explicit context boundaries address the current backlog/status drift.

**Independent Test**: Inspect the migrated hierarchy and validation output; each canonical fact
or status claim has one owner, legacy context remains readable, and the generated graph excludes
the context zone.

**Acceptance Scenarios**:

1. **Given** a contributor needs the next work item, **When** they open the roadmap, **Then**
   it identifies current, completed, blocked, and next work without reconciling several backlog
   notes.
2. **Given** a session log contains a durable decision, **When** the decision is accepted,
   **Then** its canonical record is an ADR or curated note and the log remains historical context.
3. **Given** a curated note and a context log use the same terms, **When** the graph or ranked
   retrieval index is generated, **Then** the context log is not treated as curated navigation
   truth.

---

### User Story 3 - Regenerate and validate the vault safely (Priority: P2)

A maintainer can explicitly rebuild derived artifacts and run a validation command in a hook or
CI without the validation changing files. Enforcement starts with a clean migration baseline and
becomes strict only after the team has corrected existing violations.

**Why this priority**: The executable vault must increase trust, not create silent writes,
unreviewable hook failures, or a large one-time false-positive burden.

**Independent Test**: Run the build command twice and confirm the second run is idempotent; run
the check command against a clean and an intentionally stale fixture and confirm it writes no
files while reporting the expected result.

**Acceptance Scenarios**:

1. **Given** generated artifacts are missing or stale, **When** the maintainer runs the explicit
   build command, **Then** only declared generated artifacts and generated blocks are refreshed.
2. **Given** a hook or CI runs the check command, **When** it finds a stale generated artifact or
   malformed canonical rule, **Then** it reports the problem without modifying the worktree.
3. **Given** legacy notes have not yet been normalized, **When** phased rules are introduced,
   **Then** they are visible as warnings until the documented zero-baseline transition makes the
   selected safety-critical rules errors.

---

### User Story 4 - Audit code-derived vault facts without invented certainty (Priority: P3)

A maintainer can see a generated map of actual application surfaces and can progressively link a
curated architecture note to the source it describes. If a stack-specific extractor cannot
reliably parse a fact, the vault remains useful without claiming an incorrect fact.

**Why this priority**: The current documentation is valuable, but source-to-vault drift becomes
hard to detect as the NestJS/TypeORM application grows.

**Independent Test**: Run the safe generic adapter first, then the Offers-specific adapter against
the real data source, migrations, environment configuration, source files, and tests; compare the
generated facts with those inputs and make a deliberate code/revision pin stale.

**Acceptance Scenarios**:

1. **Given** a documented source area changes after it has been pinned, **When** validation runs
   in the enforcement phase, **Then** it identifies the stale relationship and names the note to
   review.
2. **Given** the specialized adapter cannot prove an extraction, **When** generation runs,
   **Then** it fails clearly or uses the explicitly selected generic adapter; it never emits a
   guessed entity, migration, environment variable, or provider fact.

### Edge Cases

- Existing context files outside `context/log/` remain readable during migration and are not
  silently deleted or treated as generated files.
- A note can deliberately link to a future note; unresolved future-note links remain distinguishable
  from malformed links.
- Paths and headings with Ukrainian text, spaces, punctuation, or an em dash remain searchable
  through stable short references rather than fragile shell quoting.
- Codex Desktop does not run Claude Code hooks; it has a documented manual brief/handoff protocol
  rather than an implied automatic context governor.
- Evidence collection may be unavailable because the database is down or data is insufficient;
  it must report no evidence and never change scoring, budgets, profile enablement, or production
  configuration.

## Requirements

### Functional Requirements

- **FR-1201**: The project MUST retain the curated `knowledge-offers-analyzer/` vault as the
  canonical product/domain/architecture/decision knowledge base, navigable through its MOCs; the
  new mechanism MUST NOT replace it with vector RAG or another product's note tree.
- **FR-1202**: The project MUST establish one canonical owner for product vision, requirements,
  architecture invariants, roadmap/status, decisions, and feature specifications. `context/`
  MUST remain a decoupled inbox/history and MUST be excluded from curated graph/retrieval truth.
- **FR-1203**: The executable vault MUST be configured for this repository rather than inheriting
  `ai-infra` paths, product assumptions, source facts, or a universal context-budget value.
- **FR-1204**: The toolchain MUST provide a generated compact context pack, ranked find, bounded
  section show, multi-section brief, and a source-code map. English/Ukrainian synonym mapping and
  a committed retrieval regression baseline MUST be supported.
- **FR-1205**: The explicit build command MAY write only declared derived artifacts and generated
  blocks. The check command MUST be write-free and suitable for staged validation/CI.
- **FR-1206**: The existing `npm run vault:check` validation MUST remain available in parallel
  until the new check covers its required frontmatter and malformed-link guarantees with an agreed
  clean baseline.
- **FR-1207**: Enforcement MUST be phased: observe/report first; correct the baseline; then make
  generated-artifact freshness, malformed structure, and deliberately adopted integrity rules
  blocking. A strict rule MUST identify its owner, remediation, and safe bypass policy.
- **FR-1208**: A project-specific NestJS/TypeORM adapter MUST derive only facts that it can verify
  from the actual Offers Analyzer source tree. It MUST cover the data source/migrations,
  configuration/environment usage, relevant source exports, package scripts, and test surface
  before its facts become enforcement inputs.
- **FR-1209**: Code-to-vault revision pins and code-without-vault checks MUST begin narrowly on
  notes with explicit ownership. They MUST not require every historical note to carry a pin before
  the migration is healthy.
- **FR-1210**: Any evidence loop MUST be read-only, cached outside version control, explicit to
  run, and advisory. It MUST never automatically activate scoring factors, rechecks, budget
  changes, profiles, or production parameters.
- **FR-1211**: Claude Code hooks MAY be offered as an optional integration after smoke testing.
  Codex and other runtimes MUST have an equivalent explicit command protocol and must not depend
  on hooks that do not execute there.

### Key Entities

- **Canonical note**: A curated note with one durable owner and optional source/revision evidence.
- **Context note**: A decoupled log, handoff, or draft that provides historical/session context
  but is not a canonical graph fact or status owner.
- **Generated artifact**: A reproducible derived context, map, graph, health report, or index that
  is refreshed only by the explicit build path.
- **Retrieval baseline**: A versioned set of representative queries and expected results used to
  detect ranking regressions.
- **Adapter fact**: A source-derived fact produced by the explicitly selected project adapter,
  never inferred from a donor project.

## Success Criteria

### Measurable Outcomes

- **SC-1201**: A clean second build produces no content changes to derived artifacts or generated
  blocks.
- **SC-1202**: A check invocation changes zero workspace files in both clean and failing cases.
- **SC-1203**: All committed retrieval-baseline queries return their expected canonical note or
  generated code-map target at the agreed rank threshold.
- **SC-1204**: The generated graph/index contains no `context/` note as a curated node, while
  session-start orientation can still point agents to the latest context handoff.
- **SC-1205**: The specialized adapter's generated entity/migration/environment/script facts are
  traceable to the real Offers Analyzer files, and an intentionally modified pinned source path is
  detected by the adopted integrity rule.
- **SC-1206**: Existing vault frontmatter and malformed-link failures remain failures throughout
  the migration, and existing project typecheck/lint/test gates remain runnable.

## Assumptions

- Generated artifacts are reviewable repository files where reproducibility matters; local
  evidence cache and per-session context telemetry are excluded from version control.
- The current MOC names and existing ADR/spec history are preserved where possible; migration is
  additive before it becomes restrictive.
- Node.js is the appropriate implementation runtime because the existing vault check and the donor
  tool are Node-based.
- The authoritative production process remains human-reviewed SDD and ADR governance; tooling
  reports drift but does not independently make product decisions.

## Out of Scope

- Replacing the project with `ai-infra`, importing its financial domain notes, or copying its
  finance-specific adapter.
- Deploying a vector database, embedding service, or external RAG dependency.
- Retrospectively rewriting every historical session log or automatically deleting legacy notes.
- Automatic production rollouts based on evidence, retrieval scores, or context-budget signals.
