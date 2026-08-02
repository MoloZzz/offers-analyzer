# Feature Specification: Portable AI Infrastructure Kit

**Feature Branch**: `013-portable-ai-infra`
**Created**: 2026-08-02
**Status**: Implemented
**Input**: User description: "Copy reusable second-brain, product-vision-loop, and context-control mechanisms into an empty `ai-infra/` directory so they can be used easily across projects."

## User Scenarios & Testing

### User Story 1 - Bootstrap a neutral knowledge system (Priority: P1)

As a project owner, I can initialize a new repository with a neutral curated vault, isolated
context zone, and executable retrieval without inheriting Offers Analyzer product information.

**Why this priority**: This is the minimum useful cross-project capability.

**Independent Test**: Run the initializer against an empty fixture with `--dry-run`, then with
explicit `--apply`; populate the required product placeholders and run build/check successfully.

**Acceptance Scenarios**:

1. **Given** an empty target directory, **When** `init --dry-run` runs, **Then** it lists planned
   files and writes nothing.
2. **Given** the same directory, **When** `init --apply` runs, **Then** it creates a neutral vault
   configured with the `none` adapter and does not copy Offers-specific facts.
3. **Given** a generated vault, **When** `build` and strict `check` run after placeholders are
   completed, **Then** generated artifacts are reproducible and validation is clean.

---

### User Story 2 - Follow a portable product and context loop (Priority: P1)

As a contributor, I can find the current project intent, select a bounded source of truth, and
promote durable learning without session history becoming a competing specification.

**Why this priority**: Reusability is not useful if the installed documents do not control context
and ownership consistently across runtimes.

**Independent Test**: Inspect the generated template and verify its MOC, vision, requirements,
invariants, roadmap, ADR/spec, and context templates form the documented L1-to-L4 flow.

**Acceptance Scenarios**:

1. **Given** a new kit installation, **When** an agent follows the protocol, **Then** it reads a
   handoff, index, owning note, and focused code evidence in that order.
2. **Given** a session log containing durable knowledge, **When** the contributor closes work,
   **Then** the protocol directs them to promote it to one canonical curated owner.

---

### User Story 3 - Extend only when a project needs it (Priority: P2)

As a maintainer, I can add source facts, CI, hooks, or PostgreSQL evidence deliberately, without
forcing those stack-specific assumptions on docs-only, frontend, Python, or other projects.

**Why this priority**: A false universal abstraction would make the kit harder to adopt than the
current project-local mechanism.

**Independent Test**: Run a docs-only fixture through the core and inspect extension documentation
to verify it is disabled by default and does not connect to a database.

**Acceptance Scenarios**:

1. **Given** a project with no source adapter, **When** the core runs, **Then** it uses `none` and
   makes no code-fact claim.
2. **Given** a project that needs Postgres measurements, **When** the optional extension is read,
   **Then** it requires explicit read-only invocation and never auto-runs.

## Edge Cases

- A target already contains a file the initializer would create: it must report a collision and
  never overwrite without a future explicit migration command.
- A project lacks npm, GitHub Actions, PostgreSQL, or a supported agent runtime: core onboarding
  must still work through direct Node commands and neutral documentation.
- A project has stale generated files: `check` must report it without writing.
- An adapter does not support a fact capability: the core must omit it rather than infer a
  TypeORM-shaped substitute.

## Requirements

### Functional Requirements

- **FR-001**: The kit MUST be self-contained under `ai-infra/`, versioned, and runnable with Node
  20 plus built-ins for its core workflow.
- **FR-002**: The core MUST support safe configuration, Markdown/frontmatter parsing, curated graph
  generation, progressive `find`, `show`, `brief`, and `map` retrieval, build-only generated writes,
  and read-only validation.
- **FR-003**: The initializer MUST support `init --dry-run` and explicit `init --apply`, create
  files only inside the target, and refuse collisions.
- **FR-004**: The kit MUST provide clean-room templates for the canonical hierarchy and decoupled
  context zone, with no Offers product facts, paths, secrets, or current project decisions.
- **FR-005**: Source facts, CI, hooks, agent integrations, and database evidence MUST be opt-in;
  the default adapter MUST be `none`.
- **FR-006**: The adapter contract MUST be capability-based or otherwise prevent TypeORM concepts
  from becoming required core data.
- **FR-007**: The kit MUST include `doctor` and fixture tests covering no-write dry runs, collision
  safety, build/check behavior, and a docs-only installation.
- **FR-008**: The current Offers implementation MUST remain project-owned; this work must not move
  its adapter, generated data, or product policy into the generic kit.

### Key Entities

- **Kit manifest**: versioned description of the core, templates, and supported optional
  integrations.
- **Project configuration**: target-owned binding of vault paths, note names, and chosen adapter.
- **Capability adapter**: optional project-owned provider of verified code facts.
- **Template profile**: a collision-safe set of neutral files for a new project.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A clean fixture can be initialized via dry-run then apply with zero unintended files
  written during dry-run and zero overwrite collisions during apply.
- **SC-002**: A docs-only initialized fixture can build and pass strict validation using only the
  `none` adapter.
- **SC-003**: The core test suite proves that validation remains write-free and generated output is
  deterministic.
- **SC-004**: A search of `ai-infra/` finds no Offers Analyzer domain terms, configuration paths,
  source adapter, secrets, or generated project artifacts outside explicitly labelled provenance
  documentation.

## Assumptions

- Node 20 is available for the first portable CLI implementation; wrappers for other ecosystems
  are documentation/integration snippets, not a second runtime.
- Initial distribution is copy-and-own with a kit-version marker; a standalone repository or npm
  package is deferred until the kit succeeds in multiple materially different projects.
- Existing repositories adopt additively and warning-first; strict CI follows a clean baseline.
