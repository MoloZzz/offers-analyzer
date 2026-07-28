# Research: Listing Lifecycle and Tiered Re-checks

## Decision: Persist a small schedule on `Listing`

**Rationale**: A listing already owns active status, last evaluation, price history, and the profile that last evaluated it. Tier and due time are lifecycle state of that same aggregate, and a database query can select due work atomically and cheaply.

**Alternatives considered**:

- A separate job table: adds lifecycle duplication and synchronization work without a second consumer.
- Reusing the current search-result `stale` list: cannot guarantee cadence because a listing may fall out of fresh/truncated search results.

## Decision: Select due listings globally, then preserve profile context

**Rationale**: Direct re-checks do not require the listing to reappear in a paginated search. The stored profile id and threshold provide the evaluation context, while the scheduler selects active listings by due time and tier.

**Alternatives considered**:

- Per-profile round-robin from search results: misses old listings and makes the promised cadence impossible.

## Decision: Budget priorities remain tier 1/4

**Rationale**: ADR-0009 reserves priority tier 1 for near-threshold re-checks and tier 4 for lower-value re-checks. Tier 1 lifecycle listings map to budget tier 1; tiers 2 and 3 map to budget tier 4. Existing token pacing and denials remain authoritative.

## Decision: Repeat-alert materiality is 5% per listing

**Rationale**: The backlog's 5% threshold distinguishes meaningful price movement from notification churn. The baseline is the last alerted price of the same listing, separately from VIN-level relist deduplication.

**Consequence**: This narrows the earlier "any strictly lower price" rule for same-listing re-alerts. ADR-0012 owns that supersession; cheaper relists still use their VIN-level baseline.

## Decision: Roll out only after the budget evidence gate

**Rationale**: The planned lifecycle allocation is about 4,300 requests/month. SPEC-009 now exposes the evidence, but current-month history must reconcile and the operator must approve a reforecast before this new spend is enabled.
