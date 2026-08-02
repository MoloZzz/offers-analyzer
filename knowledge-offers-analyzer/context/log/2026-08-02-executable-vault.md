---
title: Executable hybrid vault implementation
type: context-log
date: 2026-08-02
updated: 2026-08-02
---

# Executable hybrid vault implementation

## Intent

Implement SPEC-012 and ADR-0015 by retaining the curated Offers Analyzer vault while adding the
portable retrieval, generated context, source-fact, and phased validation mechanisms adapted from
the imported donor.

## Implemented

- Added repository-specific `vault.config.json` and the portable Node engine under `tools/vault/`.
  It provides explicit build, strict/non-strict check, find, show, brief, map, and advisory evidence
  commands. `context/` is checked for basic hygiene but excluded from curated graph/search/index.
- Added the canonical product hierarchy: vision, requirements, invariants, Roadmap & Status, a
  concise current handoff, and retained historical backlog/context. Curated links no longer point
  into context as graph truth.
- Switched to the verified Offers NestJS/TypeORM adapter. At this snapshot it derives 17 entities,
  18 migrations, the AUTO.RIA `ListingSource`, 23 documented environment variables, npm scripts,
  and test surface. It fails rather than guessing when an entity declaration cannot be proven.
- Generated and committed `_gen/context.txt`, `index.json`, `graph.json`, `map.tsv`, `health.txt`,
  `code-map.txt`, and `facts.txt`; added bilingual synonyms, retrieval regression rows, and a
  narrow persistence-surface code/revision pin.
- Added clean strict CI and an optional non-mutating pre-commit hook. The legacy checker remains in
  `vault:check`; `vault:check:strict` is the clean-baseline CI command.
- Added a manual advisory evidence registry. Dry validation makes no database connection. A real
  run is SELECT-only in a PostgreSQL READ ONLY transaction, stores only ignored local observations,
  and cannot change scoring, profiles, budgets, or rollout state.

## Validation

- `npm.cmd run vault:test`: 15 executable-vault tests passed, including write-free check, stale
  generated output, revision pin, adapter failure, retrieval regression, and evidence safety cases.
- `npm.cmd run vault:build` twice: second build reported up to date.
- `npm.cmd run vault:check:strict`: clean (0 errors, 0 warnings); legacy checker also clean.
- `npm.cmd run vault:evidence -- --dry`: three registry metrics validated with no DB access/write.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- --runInBand` (259 tests), and
  `npm.cmd run test:contract -- --runInBand` (8 tests): all passed.

## Quality alignment discovered during verification

- Corrected a pre-existing import-order lint warning in `calibration.service.ts`.
- Updated the scoring-pipeline fixture expectation to the existing SPEC-010 reusable-cohort
  behavior: the VIN-evidenced low-mileage BMW receives the conservative +3% analytic correction,
  so the fair value is 16,480 rather than the obsolete 16,000 expectation.

## Governance and runtime notes

- ADR-0015 extends ADR-0001 and ADR-0003; no earlier product/API/budget/scoring decision was
  superseded. The curated-link sweep removed old context-as-truth references.
- Native Windows PowerShell could not use the Linux/musl RTK wrapper, so native `node`/`npm.cmd`
  commands were used. This was a wrapper fallback only; no quality gate was skipped.
- No real database evidence run was performed. That remains an explicit operator action, not a
  task-completion action.

## Related

- [[Roadmap & Status]]
- [[0015-hybrid-executable-vault|ADR-0015]]
- [[vault-protocol]]
