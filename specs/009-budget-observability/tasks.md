# Tasks: Budget Observability and Rollout Guardrails

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## Phase 1 — Foundation

- [x] T001 Add `BudgetActivity` entity, module/data-source wiring, and migration.
- [x] T002 Add request-operation/context types to the source port and propagate poll/sweep/query attribution.
- [x] T003 Update `RateBudgetService` to persist allowed and denied activity while preserving admission rules.

## Phase 2 — US1: Current budget report

- [x] T004 Add pure budget projection/reconciliation/allocation comparison with unit tests.
- [x] T005 Add `QueryService.budgetReport`, module wiring, formatter, `/budget`, and command tests.

## Phase 3 — US2/US3: Deferred work and rollout guardrail

- [x] T006 Cover tier/daily/monthly/cooldown denials and profile attribution in budget-service tests.
- [x] T007 Add rollout-ready verdict and report coverage for no evidence, mismatch, and overforecast.

## Phase 4 — Verification and knowledge base

- [x] T008 Run typecheck, targeted Jest, vault validation; update vault index/architecture/glossary/context log.
