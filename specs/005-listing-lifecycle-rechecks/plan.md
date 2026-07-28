# Implementation Plan: Listing Lifecycle and Tiered Re-checks

**Spec**: [spec.md](spec.md) | **Created**: 2026-07-28 | **Status**: Paused pending demonstrated operator profit

## Summary

Add a durable lifecycle schedule to active evaluated listings, select due work independently of
search pagination, and route each direct fetch through the existing monthly-pool priorities. A
price change records history and re-runs the existing valuation; a repeat alert requires a 5%
same-listing reduction. Production enablement remains guarded by SPEC-009 evidence and operator approval.

## Technical Context

- **Language/Runtime**: TypeScript / Node.js / NestJS.
- **Storage**: PostgreSQL / TypeORM; additive `Listing` fields and migration.
- **Scheduling**: Existing `PollService` plus a focused lifecycle selector/service; no queue or Redis.
- **Source boundary**: Existing `ListingSource.fetch` with `recheck_detail` attribution.
- **Testing**: Jest unit tests for pure tier/alert decisions and service/scheduler integration with fakes.
- **Constraint**: Existing new-listing intake, pacing, budget enforcement, scoring gate, and source adapter behavior stay compatible.

## Constitution Check

- **Spec-driven**: Complete spec, research, data model, contract, quickstart, and tasks precede implementation.
- **Knowledge base**: SPEC index, glossary, architecture, backlog, and session log must reflect implementation and the rollout gate.
- **Simple design**: Four lifecycle fields on the existing aggregate plus a small selector service; avoid a general-purpose queue.
- **Ports and limits**: Source calls stay behind `ListingSource`; every lifecycle fetch passes the existing budget/pacing boundary.
- **Testing**: Tier thresholds, active-only selection, deferrals, price change, and repeat notification thresholds are covered without live source calls.

## File Structure

```text
src/modules/listings/
  entities/listing.entity.ts
  lifecycle-recheck.ts
  lifecycle-rechecks.service.ts
src/modules/polling/
  poll.service.ts
src/modules/notifications/
  alerted-cars.service.ts
src/common/database/migrations/
test/unit/
  lifecycle-recheck.spec.ts
  lifecycle-rechecks.service.spec.ts
  poll.spec.ts
```

## Design Decisions

1. Store schedule state on `Listing`, not in a duplicate queue table.
2. Re-check due active listings globally so search truncation does not determine lifecycle coverage.
3. Use the existing `profileId` as the stored decision context; an orphaned profile is logged and skipped safely.
4. Tier 1 maps to budget priority 1; tiers 2/3 map to priority 4. The budget service decides allow/deny and records activity.
5. A 5% threshold applies to repeated alerts for the same listing; VIN-level cheaper-relist behavior remains distinct (ADR-0012).
6. Enablement is configuration-controlled and remains off until the SPEC-009 report is evidence-ready and approved by the operator.
