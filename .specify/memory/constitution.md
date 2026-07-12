<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Ratification: initial adoption
- Principles defined: I Spec-Driven Development; II Knowledge Base is Source of Truth;
  III Clean, Simple Code; IV Ports & Adapters for External Systems;
  V Respect External Limits & Legality; VI Test What Matters (contract-test external APIs);
  VII Token-Efficient Tooling (RTK)
- Added sections: Technology & External Constraints; Development Workflow & Quality Gates; Governance
- Templates reviewed: plan-template.md ✅ | spec-template.md ✅ | tasks-template.md ✅ (generic, no changes required)
- Deferred TODOs: none
-->

# Offers Analyzer Constitution

Offers Analyzer monitors car listings (AUTO.RIA first, other sources later) and surfaces
offers that are profitable relative to fair market value. These principles are binding on
every contributor and agent. They are enforced through `CLAUDE.md` and the knowledge vault.

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

### VII. Token-Efficient Tooling (RTK)

Noisy shell commands (tests, build, lint, git, grep) MUST be run through RTK to compact
output before it reaches agent context. Rationale: preserve context budget for real work.

## Technology & External Constraints

- Stack: NestJS · PostgreSQL · TypeORM · Redis + BullMQ · Telegram bot.
- Data source (v1): AUTO.RIA official REST API (`developers.ria.com`) — search, listing info,
  average price. Reference dictionaries are cached; the hourly budget is spent on search,
  info for new candidates, and average price per cohort.
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

## Governance

This constitution supersedes ad-hoc practice. Amendments require: a documented rationale
(an ADR under `knowledge-offers-analyzer/decisions/`), a version bump per the policy below,
and an update to any dependent templates in `.specify/`. Versioning follows semantic rules:
MAJOR for incompatible principle removals/redefinitions, MINOR for a new principle or
materially expanded guidance, PATCH for clarifications. All work — human or agent — is
expected to comply; `CLAUDE.md` is the runtime enforcement of these rules.

**Version**: 1.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-12
