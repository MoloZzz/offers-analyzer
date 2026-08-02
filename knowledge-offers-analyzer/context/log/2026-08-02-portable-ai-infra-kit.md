---
title: Portable AI infrastructure kit implementation
type: context-log
date: 2026-08-02
updated: 2026-08-02
---

# Portable AI infrastructure kit implementation

## Intent

Create a reusable, copy-and-own `ai-infra/` kit from the healthy mechanisms proven in Offers
Analyzer without exporting the project's product knowledge, TypeORM schema model, or database
operations to unrelated repositories.

## Implemented

- Added the Node 20 portable engine with curated/context separation, progressive retrieval,
  generated artifacts, build-only writes, read-only strict checks, and the safe `none` adapter.
- Made source facts capability-based (`sourceFacts` and `codeMap`) so no ORM, language, test
  framework, package manager, or database is required by the core.
- Added clean-room templates for product vision, requirements, invariants, roadmap, ADR/spec,
  current handoff, session logs, policy, and the L1-to-L4 promotion protocol.
- Added a collision-safe initializer (`init` defaults to dry-run and requires `--apply`) plus an
  installed-target `doctor` command. The initializer copies only the necessary engine, CLI,
  neutral templates, version, and manifest; it never enables integrations.
- Added opt-in CI, hook, Codex/Claude/agent snippets, adapter guidance, migration/security docs,
  and a documentation-only PostgreSQL evidence contract. No evidence client, credential, SQL query,
  network access, or database connection was added.
- Added `npm run ai-infra:test` to the repository and CI.

## Decision and promotions

- ADR-0016 adopts the kit as a versioned, copy-and-own bootstrap artifact. A standalone package or
  auto-synchronization is deliberately deferred until multiple different projects prove the model.
- SPEC-013 is implemented. The engineering overview, operations runbook, roadmap, specs index, and
  current handoff now name the kit and its boundaries.

## Verification

- `npm.cmd run ai-infra:test`: 8 tests passed (engine, docs-only target, dry-run/apply, collision,
  doctor, and no-write contracts).
- Fresh docs-only fixture validation covered initializer, build, strict check, installed doctor,
  generic retrieval, and no-write behavior with zero strict findings.
- Clean-room scan found no Offers-specific product terms, adapter, paths, secrets, or generated
  artifacts in `ai-infra/`.
- Native Windows PowerShell used `npm.cmd` because the Linux/musl RTK wrapper is unavailable. No
  quality gate was skipped.

## Related

- [[0016-portable-ai-infra-kit|ADR-0016]]
- [[0015-hybrid-executable-vault|ADR-0015]]
- [[Roadmap & Status]]
