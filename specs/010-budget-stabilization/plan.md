# Implementation Plan: Monitoring Budget Stabilization

**Spec**: [spec.md](spec.md) | **Created**: 2026-07-28 | **Status**: Ready

## Summary

Reduce avoidable live API demand without disabling production monitoring: stop the legacy five-per-cycle recheck of scored listings, retain slow recovery for unscored work, select reusable model/year benchmarks before any per-listing mileage cohort, and contain a refused tier-5 request to the affected evaluation.

## Technical Context

- **Language**: TypeScript / NestJS
- **Primary code**: `PollService`, pure `resolveBenchmark`, existing polling unit tests
- **Storage/migrations**: none; this changes work selection only
- **Constraints**: no source call bypasses `RateBudgetService`; no scoring activation; no sweep change

## Constitution Check

- **I**: Spec, plan, tasks, and tests precede implementation.
- **II**: The budget policy and paused SPEC-005 status are reflected in the vault.
- **III**: Uses small selection and error-boundary changes, not a new scheduler.
- **V**: Reduces official-API demand while preserving the budget ledger and source pacing.
- **VI**: Poll order/error handling and cohort selection are unit tested without live API calls.

## Design Decisions

1. A scored listing receives no legacy routine recheck. A never-scored listing is recovered at most once per 30-minute polling window, one per profile.
2. `resolveBenchmark` retains all cohort definitions for research but its live hot path starts at the reusable year cohort, then the make/model fallback; mileage correction continues downstream.
3. A `RateBudgetExhaustedError` thrown only while resolving a benchmark is logged and contained; the fetched listing remains stored but unvalued, and the round-robin loop proceeds.

## File Structure

```text
src/modules/polling/poll.service.ts
src/modules/valuation/cohort.ts
test/unit/poll.spec.ts
test/unit/cohort.spec.ts
```
