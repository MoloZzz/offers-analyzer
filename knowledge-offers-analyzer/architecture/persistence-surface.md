---
title: Persistence surface
type: architecture
updated: 2026-08-04
summary: Narrow owner for the TypeORM entity registry, migrations, and schema-review boundary.
code:
  - src/common/database/data-source.ts
  - src/common/database/migrations/*.ts
  - src/modules/**/entities/*.ts
rev: caea24b768ba
---

# Persistence surface

> This note owns the high-level TypeORM registry and migration boundary. It intentionally does
> not duplicate every entity field; generated source facts provide the current inventory.

## Source of truth

- `src/common/database/data-source.ts` exports the `ENTITIES` registry used by the application.
- Each persistent TypeORM entity names its table explicitly.
- `src/common/database/migrations/` is the append-only schema history. A new persistent table
  requires both an entity mapping and a reviewed migration; the executable-vault check compares
  those table sets.
- SPEC-015 adds append-only `valuation_evidence` and `valuation_policy_versions`, plus
  `operation_budget_states` for atomic `valuation_ai` allocation. Its migration also adds only
  nullable Listing/Opportunity evidence pointers and immutable `BudgetActivity` audit fields; it
  is additive and has not been applied by the implementation task.
- SPEC-006 US6.1 (2026-08-04) added **no table and no column**. `ParameterSet` gained six optional
  fields *inside its existing JSON `params`* and the explanation gained fields inside the existing
  JSON explanation column, so both are typing changes over data the schema already holds — no
  migration, and older rows stay readable. Worth stating because "the entity file changed" and
  "the schema changed" come apart here, and only the second requires a migration review.

## Review boundary

Changing the entity registry, an entity table mapping, or a migration requires a migration review,
the applicable tests, `npm run vault:build`, and `npm run vault:check:strict`. The check is a
structural signal, not a substitute for reviewing column semantics or a production migration plan.

## Generated evidence

Read `knowledge-offers-analyzer/_gen/facts.txt` for the current entity-to-table list and migration
table coverage. Read `_gen/code-map.txt` before changing an unfamiliar module. These artifacts are
derived from the selected Offers adapter and must be rebuilt, not edited directly.

## Related

- [[overview|Architecture overview]]
- [[coding-standards]]
- [[0015-hybrid-executable-vault|ADR-0015]]
- [[environment-setup]]
