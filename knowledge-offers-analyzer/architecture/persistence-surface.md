---
title: Persistence surface
type: architecture
updated: 2026-08-02
summary: Narrow owner for the TypeORM entity registry, migrations, and schema-review boundary.
code:
  - src/common/database/data-source.ts
  - src/common/database/migrations/*.ts
  - src/modules/**/entities/*.ts
rev: cd1eff55a902
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
