---
title: Architecture overview
type: architecture
updated: 2026-07-12
---

# Architecture overview

> Living map of the Offers Analyzer system: modules, data flow, and boundaries. Keep in sync with the code (see [[vault-protocol]]).

## Stack

- **Runtime/Framework:** Node.js + NestJS. _(TODO: confirm ORM — likely TypeORM; confirm DB.)_
- **Repository:** `MoloZzz/offers-analyzer` (GitHub).

## Module map

_TODO: fill as modules land. One row per module._

| Module | Responsibility | Key files | Notes |
|--------|----------------|-----------|-------|
| _(none yet)_ | — | — | Bootstrap stage |

## Data flow

_TODO: describe how an offer enters the system, is analyzed, and is stored/returned. Add a diagram when the first end-to-end path exists._

## Entities / data model

_TODO: list core entities (e.g. Offer) and their relationships. Cross-link domain terms to [[glossary]]._

## Boundaries & integrations

_TODO: external systems, APIs, queues. None yet._

## Related

- [[00-INDEX]]
- [[glossary]]
- [[decisions/README]]
