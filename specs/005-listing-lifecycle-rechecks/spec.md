# Feature Specification: Listing Lifecycle and Tiered Re-checks

**Feature Branch**: `005-listing-lifecycle-rechecks`  
**Created**: 2026-07-28  
**Status**: Draft  
**Input**: Catch viable listings that become deals after a price reduction while staying inside the approved monthly request pool.

## User Scenarios & Testing

### User Story 1 - Re-check a near-deal before it is missed (Priority: P1)

An operator receives a fresh alert when a previously observed, still-active listing becomes a deal after its price falls, rather than seeing only cars that were bargains on their first day.

**Why this priority**: Price reductions after several weeks are the main lifecycle path to a real purchase opportunity; one-time ingest structurally misses them.

**Independent Test**: Seed active listings around a profile threshold, advance the scheduler clock, and verify that only due tier-1 listings are re-checked, re-scored after a lower asking price, and can generate a new alert.

**Acceptance Scenarios**:

1. **Given** an active listing whose score is within 10% below its profile threshold, **When** it is due, **Then** it is selected for re-check no later than every two days, subject to the approved budget.
2. **Given** that re-check finds a lower price and the listing now qualifies, **When** it is re-scored, **Then** the operator receives an alert containing the current price and the recorded price change.
3. **Given** a listing has disappeared or is no longer active, **When** selection runs, **Then** it is not fetched again.

---

### User Story 2 - Prioritize motivated sellers (Priority: P1)

An operator sees listings with observable urgency (a recorded cut or long days-on-market) revisited sooner than equally scored static listings.

**Why this priority**: Seller behavior is stronger evidence of an emerging deal than a static initial score.

**Independent Test**: Seed listings with identical score distance but different DOM and cut history; verify escalation, due time, and budget priority are deterministic.

**Acceptance Scenarios**:

1. **Given** an active listing older than 45 days or with at least one recorded cut, **When** its tier is calculated, **Then** it is promoted by one tier without exceeding tier 1.
2. **Given** a re-check records a new cut, **When** the next tier is calculated, **Then** the higher urgency applies immediately.

---

### User Story 3 - Keep repeat alerts useful (Priority: P2)

An operator is alerted again for the same listing only after a material (at least 5%) reduction from the price in the prior alert, so price dynamics are visible without repeated noise.

**Why this priority**: A small change is rarely actionable; a meaningful cut can turn a known listing into a materially different deal.

**Independent Test**: Re-score the same listing after 4.99% and 5.00% reductions and verify that only the latter creates a repeat notification.

**Acceptance Scenarios**:

1. **Given** a listing already alerted at a higher price, **When** its new price is less than 5% lower, **Then** its re-evaluation is stored but no repeat alert is sent.
2. **Given** a listing already alerted at a higher price, **When** its new price is at least 5% lower and it still qualifies, **Then** exactly one repeat alert is sent.

### Edge Cases

- A budget denial defers due work without advancing its due time or falsely marking it checked.
- A direct detail fetch that no longer resolves as an active listing removes it from future re-check selection without fabricating a sale.
- A listing can be visible through more than one profile; the recorded evaluation keeps the profile threshold used for its next selection explicit.
- Price changes in another currency are compared through the normalized stored value, not formatted display text.
- A temporarily failed fetch is logged and retried by normal due-work selection; it must not promote the listing or create an alert.

## Requirements

### Functional Requirements

- **FR-501**: The system MUST persist each active evaluated listing's re-check tier, next due time, and the profile/threshold used to determine it.
- **FR-502**: The system MUST classify score distance below the threshold as tier 1 (within 10%), tier 2 (more than 10% through 25%), or tier 3 (more than 25%).
- **FR-503**: The system MUST schedule tier 1 no less often than every 2 days, tier 2 weekly, and tier 3 every 14 days; configuration may disable tier 3 only as an explicit policy.
- **FR-504**: The system MUST promote one tier, capped at tier 1, when DOM exceeds 45 days or a price cut has been observed.
- **FR-505**: Re-check selection MUST exclude listings that are not active and MUST consume the existing monthly-pool priority/budget admission before a source detail request.
- **FR-506**: A re-check that detects a changed asking price MUST record the observation, re-evaluate the listing, and update its tier and due time.
- **FR-507**: A qualifying listing MAY produce a repeat alert only when its asking price is at least 5% below the asking price in its previous alert for that same listing; each qualifying price state MUST produce at most one notification.
- **FR-508**: The system MUST attribute lifecycle requests as tier-1 or tier-2 re-check work in budget activity and make deferrals observable through the existing budget report.
- **FR-509**: The system MUST retain the current new-listing ingestion behavior while lifecycle re-checks are rolled out behind the SPEC-009 evidence gate and explicit operator approval.

### Key Entities

- **Re-check schedule**: Persisted tier, next due timestamp, and selection context for an active evaluated listing.
- **Price-cut event**: A newly recorded lower asking price for a listing; it triggers re-evaluation and urgency escalation.
- **Repeat-alert baseline**: The previous alerted price for a particular listing, used to decide whether a price change is material.

## Success Criteria

- **SC-501**: In a deterministic clock-based test, every eligible tier-1 listing is selected within 48 hours of becoming due when budget is available.
- **SC-502**: A qualifying 5% price reduction produces one repeat alert; a 4.99% reduction produces none.
- **SC-503**: No removed listing appears in a lifecycle fetch queue in automated selection tests.
- **SC-504**: Lifecycle request activity and deferrals reconcile in `/budget` without an unlabelled source request.
- **SC-505**: Within two months of approved live rollout, at least 30% of alerts originate from a lifecycle re-check rather than initial ingest, or the operator records a review explaining why the hypothesis failed.

## Assumptions

- SPEC-009's current-month reconciliation and operator reforecast approval are prerequisites to enabling this work in production.
- Existing `PriceObservation` history supplies price-cut evidence; no external transaction data is needed.
- The existing score and threshold remain the gate for an alert; lifecycle work changes observation timing, not scoring methodology.

## Out of Scope

- Activating survivorship correction `k`, factor bounds, or changing the score threshold.
- New seller-motivation factor weighting (SPEC-003 follow-up).
- Market-demand scoring and cross-source lifecycle reconciliation.
