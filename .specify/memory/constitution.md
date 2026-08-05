<!--
Sync Impact Report
- Version change: 1.3.0 → 1.4.0
- Ratification: initial adoption
- Principles defined: I Spec-Driven Development; II Knowledge Base is Source of Truth;
  III Clean, Simple Code; IV Ports & Adapters for External Systems;
  V Respect External Limits & Legality; VI Test What Matters (contract-test external APIs);
  VII Context Economy (RTK + delegation to tiered subagents); VIII Executable Knowledge Hygiene
- Added sections: Technology & External Constraints; Development Workflow & Quality Gates; Governance
- Templates reviewed: plan-template.md ✅ | spec-template.md ✅ | tasks-template.md ✅ (generic, no changes required)
- Deferred TODOs: none
-->

# Offers Analyzer Constitution

Offers Analyzer monitors car listings (AUTO.RIA first, other sources later) and ranks them by
the **probability of bringing the operator profit on resale** — an operator's (перекуп's)
assistant, not a market appraiser (ADR-0006). Price below fair market value is the dominant
factor of that ranking, not its definition. These principles are binding on every contributor
and agent. They are enforced through `CLAUDE.md` and the knowledge vault.

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Non-trivial features MUST go through Spec Kit before code: `constitution → specify → plan →
tasks → implement`. The specification is the source of truth; code is the downstream artifact.
No production feature is implemented without an approved spec and plan under `.specify/`.
Rationale: intent is captured and reviewed before, not after, a large code dump.

### II. Knowledge Base is the Source of Truth

The vault at `knowledge-offers-analyzer/` is the primary navigation layer. Agents MUST read
`context/goals.md` + the latest `context/log/*`, then `00-INDEX.md`, before touching code, and
MUST update the vault as part of "done": durable facts promoted from `context/` into curated
notes (architecture, glossary, decisions, conventions, research). A change is not complete
until the vault reflects it. Rationale: shared, persistent memory over ad-hoc grepping.

### III. Clean, Simple Code

Code MUST be readable and simple: single responsibility per unit, thin controllers →
services → repositories, meaningful names, no business logic in controllers, no `any`.
Prefer simplicity over flexibility — add abstraction only when a second real case exists
(YAGNI). Extensibility is applied where the domain demands it, not everywhere. Rationale:
optimize for the next reader; needless abstraction is a cost, not a feature.

### IV. Ports & Adapters for External Systems

External systems (AUTO.RIA API, Telegram, database, queue) MUST sit behind interfaces
(ports) with concrete adapters. Listing sources MUST implement a common `ListingSource`
port so additional sites can be added without changing core logic. Domain logic MUST be
isolated from framework and IO. Rationale: swappable, testable, multi-source by design.

### V. Respect External Limits & Legality

The system MUST honor source API rate limits (AUTO.RIA free tier ~30 req/hour), Terms of
Service (including the required backlink), and MUST budget requests (cache dictionaries,
fetch details only for new/changed listings). v1 uses the official API only — no scraping.
Secrets (API keys, bot token) MUST live in environment config, never in code. Rationale:
sustainable, lawful ingestion; bans and legal risk are existential for a monitor.

### VI. Test What Matters — Contract-Test External APIs

Core logic (valuation/profitability, deduplication, request budgeting) MUST be unit-tested.
The external API MUST be contract-tested against recorded fixtures; tests MUST NOT hit the
live rate-limited endpoint. Rationale: protect the logic that defines the product and stay
within the request budget.

### VII. Context Economy — Token-Efficient Tooling and Delegation

Noisy shell commands (tests, build, lint, git, grep) MUST be run through RTK to compact
output before it reaches agent context.

Work that is **independent, already specified, and cheaply verifiable** MUST be delegated to a
named subagent (`.claude/agents/`) rather than performed in the orchestrating context, so the
material consulted to produce a result never enters the context that consumes it. Model tier is
pinned per agent, not chosen per task. Read-only agents may run in parallel; write-capable agents
run one at a time on a shared tree. Spec authorship, ADRs, prioritization, evidence-gated scoring
changes, and the vault write protocol are NEVER delegated — subagents report durable facts, the
orchestrator promotes them. Where a runtime provides no subagent mechanism, work in-context and
state the fallback. See ADR-0022 and `conventions/delegation.md`.

Rationale: preserve context budget for real work, and give each independent slice a context sized
to its actual scope.

### VIII. Executable Knowledge Hygiene

The curated vault remains the human source of truth, but contributors MUST use its progressive
L1-to-L4 retrieval protocol when orienting work: generated brief, focused find, bounded section,
then full note/source only when needed. Context notes remain outside curated graph/retrieval truth.
`vault build` alone regenerates committed derived artifacts; `vault check` is write-free and strict
validation protects the agreed clean baseline. Database evidence is explicit, read-only, locally
cached, and advisory; it can never authorize a product change. Rationale: durable project memory
must be precise, low-noise, reproducible, and safe in every agent runtime.

## Technology & External Constraints

- Stack: NestJS · PostgreSQL · TypeORM · Telegram bot. Scheduling is a `@nestjs/schedule` cron
  with a Postgres-backed rate budget — no Redis/queue in v1 (see ADR-0004).
- Data source (v1): AUTO.RIA official REST API (`developers.ria.com`) — search, listing info,
  average price. Reference dictionaries are cached; the hourly budget is spent on search,
  info for new candidates, and average price per cohort.
- **Advisory AI services** (general-purpose language models) are a distinct, admitted class of
  external system, separate from data sources. They MUST be human-triggered, admin-only, disabled by
  default, separately budgeted (never drawing on the source pool), cached on a content hash, and
  recorded immutably. Their output is **advisory only**: it MUST NOT influence any score, factor,
  confidence, threshold, `ParameterSet`, alert set, or correction — in either direction. Text
  authored by a counterparty (a seller description) is passed only as delimited untrusted data,
  never as instruction, and responses are validated against a strict schema and discarded whole when
  invalid. See ADR-0019.
- Persistence: listings and price observations are stored from day one to enable own-statistics
  valuation and price-drop detection.
- Config & tooling: strict `tsconfig`, ESLint (typescript-eslint strict) + Prettier now;
  heavier gates (pre-commit hooks, commitlint, CI, coverage floor) added proportionally as the
  project grows — not front-loaded.

## Development Workflow & Quality Gates

1. Follow the SDD sequence (Principle I). Reflect implemented specs back into the vault.
2. Definition of done for every task: code/spec complete; commands run via RTK; the vault
   updated (Principle II); SDD artifacts under `.specify/` consistent with the code.
3. Reviews verify: adherence to these principles, clean-code conventions
   (`conventions/coding-standards.md`), and that new domain terms/decisions were promoted
   into the curated vault.
4. Complexity must be justified against Principle III; unjustified abstraction is rejected.
5. **Operator-value test (ADR-0006):** before building any scoring/product feature, ask
   *"чи використовує це хороший перекуп при купівлі авто?"* If not, it likely does not move
   the operator toward profit and should be challenged in the spec.
6. For a change affecting curated notes, source facts, adapter logic, or generated output, run
   `npm run vault:build` and `npm run vault:check:strict`. The compatibility command
   `npm run vault:check` remains part of the same gate.
7. **Delegated slices are verified independently and recorded.** Any slice built by an
   `oa-implementer` subagent that changed behavior MUST pass `oa-verifier` before acceptance — an
   implementer reporting its own success is not evidence. The delegation (agent, model, slice) is
   recorded in the context log, and every `VAULT:` line a subagent returned MUST be promoted to
   its owning note by the orchestrator (Principle VII, Principle II).

## Governance

This constitution supersedes ad-hoc practice. Amendments require: a documented rationale
(an ADR under `knowledge-offers-analyzer/decisions/`), a version bump per the policy below,
and an update to any dependent templates in `.specify/`. Versioning follows semantic rules:
MAJOR for incompatible principle removals/redefinitions, MINOR for a new principle or
materially expanded guidance, PATCH for clarifications. All work — human or agent — is
expected to comply; `CLAUDE.md` is the runtime enforcement of these rules.

**Version**: 1.4.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-08-05
<!-- 1.0.1: PATCH — Technology stack refined to drop Redis/BullMQ from v1 (ADR-0004). -->
<!-- 1.0.2: PATCH — Rate budget is now Postgres-backed (durable) instead of in-memory (ADR-0004, B13). -->
<!-- 1.1.0: MINOR — Mission reframed to operator-profit ranking (composite Total Deal Score, price dominant) + operator-value workflow gate (ADR-0006). -->
<!-- 1.3.0: MINOR — Admitted advisory AI services as a distinct external-system class under a hard advisory-only boundary (ADR-0019). -->
<!-- 1.2.0: MINOR — Executable-vault retrieval, generated-artifact safety, and advisory evidence governance (ADR-0015). -->
<!-- 1.4.0: MINOR — Principle VII broadened from RTK to Context Economy: independent, specified, verifiable work is delegated to named subagents with pinned model tiers; delegated slices are independently verified and recorded (ADR-0022). -->
