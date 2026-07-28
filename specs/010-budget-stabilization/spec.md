# Feature Specification: Monitoring Budget Stabilization

**Feature Branch**: `010-budget-stabilization`  
**Created**: 2026-07-28  
**Status**: Draft  
**Input**: Production budget evidence from 2026-07-28; ADR-0009 and ADR-0011.

## User Scenarios & Testing

### User Story 1 - Preserve new-listing discovery within the monthly pool (Priority: P1)

The operator keeps production monitoring active while routine checks of already evaluated listings
no longer consume the budget intended for fresh listings. An unscored listing can still recover
from an interrupted evaluation without creating an unbounded repeat-work loop.

**Independent Test**: Given a profile containing both scored and unscored known listings, a poll
only schedules bounded recovery work for the unscored listing and does not fetch scored listings.

### User Story 2 - Reuse comparable-price evidence (Priority: P1)

When an incoming listing needs a benchmark, the system first uses a reusable model/year cohort.
It retains the existing analytical mileage adjustment, but does not create a live, uniquely
mileage-banded request per newly seen listing.

**Independent Test**: Given listings of the same model/year with different mileages, they resolve
through the reusable benchmark path and do not request a mileage-banded average.

### User Story 3 - Degrade one evaluation without stopping discovery (Priority: P1)

If a low-priority comparable-price request is refused, the listing detail already obtained is
retained and the remainder of fresh-listing processing continues. The operator can later see the
denial in the existing budget ledger.

**Independent Test**: Given a tier-5 budget refusal during one evaluation, the next new listing is
still fetched and recorded, while the refused listing has no fabricated valuation.

## Requirements

- **FR-1001**: Routine rechecks MUST exclude listings with an existing score while SPEC-005 is paused.
- **FR-1002**: Recovery rechecks for never-scored listings MUST have a fixed, low maximum cadence.
- **FR-1003**: Hot-path benchmark resolution MUST not make a live request for a mileage-banded cohort.
- **FR-1004**: Benchmark refusal caused by a low-priority budget denial MUST not abort the remaining polling cycle or invent a fair value.
- **FR-1005**: New-listing detail fetch attribution, budget admission, and the immutable ledger MUST remain unchanged.

## Success Criteria

- **SC-1001**: A fully scored profile produces zero routine recheck-detail calls in a poll cycle.
- **SC-1002**: A low-priority benchmark denial leaves later new listings in the same cycle eligible for collection.
- **SC-1003**: For a shared model/year cohort, repeat evaluations reuse one comparable-price result rather than issue mileage-specific live requests.

## Assumptions

- SPEC-005 remains paused until the monitor demonstrates operator profit.
- The daily sweep remains unchanged in this slice because reducing an incomplete crawl would corrupt disappearance evidence; its allocation is reforecasted separately from this demand reduction.
- Existing mileage adjustment is retained when the reusable cohort is selected.

## Out of Scope

- Tiered lifecycle re-check scheduling (SPEC-005), changes to sweep coverage, automatic budget reallocation, or a historical ledger backfill.
