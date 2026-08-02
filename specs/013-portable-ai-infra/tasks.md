# Tasks: Portable AI Infrastructure Kit

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: Specification and boundaries

- [x] T001 Add SPEC-013, ADR-0016, and project-vault links for the kit decision.
- [x] T002 Define core/plugin/template ownership and prohibited Offers-specific content.

## Phase 2: Portable core (US1)

- [x] T003 Extract generic engine, null adapter, and core tests into `ai-infra/engine/`.
- [x] T004 Make source facts capability-based and preserve safe build/check contracts.
- [x] T005 Add an engine fixture proving docs-only build/check and write-free validation.

## Phase 3: Governance templates (US2)

- [x] T006 Add clean-room vault, policy, context, ADR/spec, and product-loop templates.
- [x] T007 Add operating, migration, security, and adapter-contract documentation.

## Phase 4: Bootstrap and extensions (US1, US3)

- [x] T008 Implement `init --dry-run`, `init --apply`, and `doctor` with collision safety.
- [x] T009 Add opt-in CI, hook, Codex/Claude, and npm integration snippets.
- [x] T010 Add an optional PostgreSQL-evidence plugin contract without live credentials or queries.

## Phase 5: Validation and close-out

- [x] T011 Run kit unit/fixture tests and inspect dry-run/apply behavior.
- [x] T012 Scan kit content for Offers-specific leakage and verify direct CLI commands.
- [x] T013 Update generated vault artifacts, strict validation, quality gates, spec status, and task log.
