# Feature Specification: Realized-Price Calibration (survivorship correction)

**Feature Branch**: `004-realized-price-calibration`

**Created**: 2026-07-23

**Status**: Draft (US4.1–4.2 + US4.1b implemented; US4.3a–4.4 later phases)

**Input**: Backlog epic "Оцінка вигідності v2" (2026-07-22), SPEC-004 entry — central
hypothesis: `fair_value` (RIA `average_price` interQuartileMean) is measured over **active**
listings only — length-biased sampling. Addendum to
[ADR-0006](../../knowledge-offers-analyzer/decisions/0006-operator-profit-vision.md).

## Context & Problem

A fairly-priced car sells in ~3 weeks and leaves the active-listing sample; an overpriced one
sits 3–4 months and stays in it — overpriced listings are structurally over-represented in the
average we anchor fair value on. Expected effect: `fair_value` inflated 8–15%, so the current
0.63 threshold (≈19% nominal discount) is really only ~6–10% off actual realized price —
margin-negative after haggling and paperwork. This is the leading explanation for the "deals"
not panning out.

The correction: measure a candidate factor `k` from plausible exits — listings that *disappear*
from search results — and, only after validation, apply `X = RIA_average × k`. Zero API cost: the
per-profile id-list search is already made every cycle; a diff against what we saw before
detects disappearances for free.

**What already exists and is NOT rebuilt here**: `price_observations` history (price cuts),
`average_price_snapshots` keyed by cohort (the denominator series for US4.3), `Listing.status`
(`removed`/`sold` values exist but were never set), passive Outcome label `'disappeared'`
(declared in spec 002, never recorded — E2c-later), VIN normalization (B12).

## Guiding constraints (non-negotiable)

- **Zero extra API requests.** Detection consumes only the searches already made. The
  detection service is structurally incapable of spending budget (no source dependency).
- **Disappearance ≠ sale.** The pipeline must filter delistings, relists, window artifacts,
  paging artifacts before anything reaches calibration.
- **Fail conservative.** Residual false positives must bias `k` upward (toward 1.0 = no
  correction), never downward — a wrong correction is worse than a weak one.
- **Falsifiable.** If measured `k ≥ 0.97`, the survivorship hypothesis is rejected and the
  cause of bad deals is elsewhere (cohort composition, mileage correction).
- **`k` is versioned.** When applied (US4.4), `k` lives in the `ParameterSet`
  (ADR-0005) — rollbackable, shown in `/why` with its source tier and event count.
- **Evidence before activation.** A disappearance and its last asking price are proxies, not a
  confirmed sale and transaction price. US4.3a's readiness report and persisted evaluation
  explanations are mandatory before a candidate `k` can affect live scoring
  ([[0011-evidence-gated-scoring-rollout|ADR-0011]]).

## User Scenarios & Testing *(mandatory)*

### User Story 4.1 — Track disappearances (Priority: P0) — THIS PHASE

Every poll cycle, listings that stop appearing in eligible searches are detected and recorded
as `listing_disappearances` events carrying the calibration payload: cohort key, last known
USD price, first/last seen, days-on-market, price-cut stats.

**Independent Test**: seed listings seen by a persistent profile; make one absent from search
results for > grace period → exactly one disappearance row with sane `domDays` appears, the
listing flips to `status='removed'`, and the cycle's API request count is unchanged.

**Acceptance Scenarios**:

1. **Given** a listing seen by an eligible profile, **When** it is absent from all eligible
   searches for more than the grace period (24h), **Then** one disappearance event is recorded
   (idempotent — never a second for the same listing) with `disappeared_at` = last confirmed
   sighting, and the listing's status becomes `removed`.
2. **Given** a profile with a `submittedWithin` filter, **When** listings age out of its
   window, **Then** no disappearance is recorded on that evidence (the profile is never
   detection-eligible; its sightings still count as "seen").
3. **Given** a profile-cycle whose search result was truncated (total > returned ids, or
   total unknown and ids at the page cap), **Then** that cycle's absence proves nothing
   (profile ineligible for that cycle).
4. **Given** a removed listing that reappears in any search, **Then** it is resurrected to
   `active` and its disappearance event is voided (`reappeared_at` stamped) — excluded from
   calibration.
5. **Given** any cycle, **Then** the number of source API requests is identical to the same
   cycle without detection (id-diff adds zero requests).

### User Story 4.1b — Daily market sweep (Priority: P0) — THIS PHASE (added 2026-07-23)

The operator's real niche is market-wide ("all Kyiv region ≤ $15k"), which matches ~18k active
listings — far beyond one 100-id page, so no plain persistent profile can ever be
detection-eligible. A **sweep profile** (persistent filters + `filters.sweep: true`) is instead
crawled **once daily** by a paged, ids-only search until the full match set is collected
(~179 requests for 17.9k listings), budget-guarded. A *complete* sweep is full-coverage
sighting evidence: it bumps every matched listing and then runs the same disappearance
detection with a sweep-specific grace of 30h — so one missed/failed sweep never records an
event (two consecutive misses do), and pagination drift within a sweep is absorbed.

This deliberately amends the zero-cost framing: **detection on regular profiles stays
zero-request; the sweep buys ~5,400 req/mo** (≈179 × 30) from the ADR-0009 pool as a
data-collection investment — the same funding logic as SPEC-005. Sweep profiles are excluded
from the 10-minute poll (they never ingest or evaluate; ids only).

**Independent Test**: a sweep profile over a fake source with 250 matching ids collects all
pages, bumps all sightings, and records a disappearance only for a covered listing absent
> 30h; an incomplete sweep (budget abort mid-pages) records nothing.

**Acceptance Scenarios**:

1. **Given** a sweep profile and a multi-page match set, **When** the daily sweep runs,
   **Then** it pages until the collected ids cover the reported total (or a short page),
   and every matched known listing's sighting timestamp is bumped.
2. **Given** the sweep aborts on budget exhaustion mid-crawl, **Then** no detection runs on
   the partial id set and the sweep is retried next day.
3. **Given** a complete sweep, **Then** detection runs with 30h grace — a listing missed by
   exactly one sweep is never recorded; absent from two consecutive sweeps it is.
4. **Given** a sweep profile, **Then** the 10-minute poll neither searches it nor ingests
   from it (its budget cost is the daily crawl only).

### User Story 4.2 — Filter non-sales (Priority: P0) — THIS PHASE

Disappearance ≠ sale (could be delisted/expired/banned/relisted). Events are annotated so
calibration (US4.3) can select plausible sales: `dom_days` for the `< 60` filter, and relist
detection — a newly ingested listing matching a recent disappearance (same VIN, or
make+model+year+city with mileage within ±2k km, within 30 days) marks the event
`is_relist = true`.

**Independent Test**: ingest a new listing with the same VIN as a listing that disappeared 5
days ago → its event gets `is_relist = true` + the new listing's id; a fuzzy-match twin
(same make/model/year/city, mileage +1k) does the same; a listing outside the 30-day window
does not.

**Acceptance Scenarios**:

1. **Given** a disappearance within the last 30 days and a new listing with an equal
   normalized VIN, **Then** the event is marked `is_relist = true` with `relist_listing_id`.
2. **Given** no VIN on either side but equal markId+modelId+year+cityId and |Δmileage| ≤ 2
   (thousand km), **Then** the event is likewise marked a relist.
3. **Given** an event already voided by reappearance or already marked relist, **Then** it is
   never re-marked.

### User Story 4.3 — Compute candidate `k` per cohort (Priority: P0) — LATER PHASE

`k = median(last_known_price_usd of filtered disappearances) / median(cohort average on the
disappearance date)` per cohort; ≥30 events/cohort required, else fallback make+model → make →
global (start 0.90). Recomputed weekly. It is an estimate of active-listing bias, not a claimed
realized-sale price. *(Not implemented in this phase — tasks created at pickup.
`average_price_snapshots` already accrues the denominator series keyed by the same cohort-key
format.)*

### User Story 4.3a — Validate the candidate before rollout (Priority: P0) — LATER PHASE

Before US4.4 can create or activate a `ParameterSet`, the operator receives a reproducible
calibration-readiness report. It shows the candidate `k` by cohort and fallback tier, eligible
event count, excluded/voided/relist count, bootstrap confidence interval, and stability across
materially different cohorts. The report explicitly marks `k ≥ 0.97` as a falsification, not a
candidate to tune around.

**Independent Test**: seed eligible, voided, relisted, and sparse cohorts; run the report → it
uses only eligible live events, exposes its exclusions and interval, labels sparse/fallback data,
and refuses to mark the candidate ready when a required field is missing.

**Acceptance Scenarios**:

1. **Given** a cohort with ≥30 eligible live events, **When** the weekly report runs, **Then** it
   publishes `k`, an interval, event/exclusion counts, and the denominator-snapshot date.
2. **Given** a sparse cohort, **When** the report runs, **Then** it shows the exact fallback tier
   and does not present the result as cohort-level evidence.
3. **Given** `k ≥ 0.97`, **When** the report runs, **Then** it marks the survivorship hypothesis
   falsified and blocks US4.4 from proposing an activation.
4. **Given** a candidate report without persisted evaluation explanations, **When** an operator
   tries to activate it, **Then** activation is blocked and the missing provenance is named.

### User Story 4.4 — Apply `k` (Priority: P0) — LATER PHASE

`X = RIA_average × k`, `discount = (X − asking) / X`; `k` lives in the `ParameterSet`
(ADR-0005), versioned/rollbackable; `/why` shows the applied `k`, its source tier, and the
event count behind it. *(Not implemented in this phase.)*

### Edge Cases

- Listing only ever ingested via a `submittedWithin` profile and covered by no persistent
  profile → never a disappearance candidate (coverage check) — correct, absence proves nothing.
- Price increase moves a listing out of a profile's `priceTo` band → false disappearance.
  **Accepted residual risk**: requires a price *rise* (rare; typical of overpriced sitters the
  `dom < 60` filter drops anyway); medians in US4.3 are robust to modest contamination; bias
  direction is upward on `k` (conservative).
- Budget exhaustion mid-Phase-1 → the cycle aborts before detection runs (incomplete sighting
  data must never be diffed).
- Listings recorded via `/check` (never search-covered) → `last_seen_in_search_at` stays null →
  never candidates.
- Pre-feature listings: `last_seen_in_search_at` is backfilled from `lastSeenAt` (bumped only
  on fetch, so weeks-stale) → their events are stamped `detection_mode='backfill'` so US4.3
  can exclude the lower-quality initial wave.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-401**: Every poll cycle MUST bulk-record a search sighting (`last_seen_in_search_at`)
  for all known listings whose ids appear in any profile's search result, at zero extra API
  cost.
- **FR-402**: A profile-cycle MUST be detection-eligible only if the profile has no
  `submittedWithin` filter AND its result is complete (total ≤ returned ids; unknown total
  with ids at the page cap is treated as truncated).
- **FR-403**: A disappearance MUST be recorded only for an `active` listing absent from
  search for > 24h (grace) AND covered, by stored attributes, by ≥1 detection-eligible
  profile of the current cycle.
- **FR-404**: The event MUST carry: cohort key (same format as the benchmark cache /
  `average_price_snapshots`), last known USD price, `first_seen_at`, `disappeared_at`
  (= last sighting, not detection time), `dom_days`, `price_cuts_count`, `had_price_cut`
  (derived from `price_observations`), `detection_mode` (`live`/`backfill`).
- **FR-405**: Recording MUST be idempotent (one event per listing, ever) and MUST set
  `Listing.status = 'removed'`.
- **FR-406**: A removed listing reappearing in any search MUST be resurrected to `active`
  with the event voided via `reappeared_at`.
- **FR-407**: New-listing ingestion MUST check recent (≤30 days) unvoided, non-relist events
  for identity match — normalized-VIN equality, or markId+modelId+year+cityId equality with
  |Δmileage| ≤ 2 (thousand km) — and mark `is_relist = true` + `relist_listing_id`.
- **FR-408**: Each recorded disappearance MUST also record the passive Outcome
  `'disappeared'` (spec 002 E2c-later; deduped), from the poll layer —
  `listing_disappearances` remains the sole source of truth for calibration.
- **FR-409**: The detection service MUST NOT depend on the listing source port (structural
  zero-API guarantee for detection itself; the sweep crawl lives in a separate service).
- **FR-410**: A profile with `filters.sweep = true` MUST be excluded from the poll cycle
  (never searched every 10 min, never ingested/evaluated) and crawled once daily instead:
  paged ids-only search until the collected set covers the source-reported total (or a short
  page), each page budget-gated.
- **FR-411**: Detection MUST run on a sweep's id set only when the sweep is COMPLETE; a
  budget-aborted or partial sweep MUST be discarded. Sweep detection uses a 30h grace
  (absence from ≥2 consecutive daily sweeps) instead of the regular 24h.
- **FR-412**: Sweep sightings MUST bump `last_seen_in_search_at` exactly like regular
  sightings (a sighting is a sighting), so sweep and poll evidence compose.
- **FR-413**: US4.3a MUST build a reproducible calibration-readiness report from stored events:
  source cohort/fallback tier, eligible/voided/relist counts, candidate `k`, bootstrap interval,
  denominator-snapshot date, and an explicit falsification/ready status.
- **FR-414**: US4.4 MUST NOT create or activate a live `ParameterSet` from `k` unless the latest
  readiness report is ready, evaluation explanations are persisted, and the operator explicitly
  approves the candidate, per ADR-0011.

### Key Entities

- **ListingDisappearance**: one row per disappeared listing — the calibration event
  (see plan.md §Data Model).
- **Listing** (extended): `last_seen_in_search_at` — last time the listing's id appeared in
  any search result (distinct from `lastSeenAt`, which requires a fetch).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-401**: Per-cycle source request count is unchanged with detection enabled (id-diff
  adds zero API requests); the detection service has no source dependency. The sweep's cost
  is bounded to its daily crawl (~pages/day, ≈5,400 req/mo for the 17.9k-listing niche).
- **SC-402**: With no eligible or sweep profile enabled, zero events are recorded — no false
  positives from window aging.
- **SC-403**: After 3 weeks with ≥1 persistent profile enabled, ≥30 eligible disappearance events
  exist for at least one active cohort; a candidate `k` and its exclusions are recorded in the
  readiness report — expectation 0.85–0.95; **`k ≥ 0.97` falsifies the survivorship hypothesis**.
- **SC-404**: All existing tests pass unchanged; new pure functions and service behavior are
  unit-tested (eligibility, coverage, grace, resurrection, relist, cut stats).
- **SC-405**: No candidate `k` reaches live scoring without a ready report, stored explanation
  provenance, and explicit operator approval.

## Assumptions

- **Operator prerequisite**: at least one *persistent* profile (no `submittedWithin`, ≤100
  matches) **or a sweep profile (US4.1b)** must be enabled for events to accrue — with only
  the "today" profile enabled the feature is correctly inert. Cost note: a regular enabled
  profile costs ~4,300 searches/mo (ingestion); the market-wide sweep ~5,400 req/mo (crawl) —
  both funded by the ADR-0009 pool. Operator decision 2026-07-23: model-pinned niche profiles
  rejected; the market-wide sweep is the chosen path.
- Search results at `countpage=100` without explicit paging represent the full match set
  whenever reported `total ≤ ids.length` — trusted as the completeness signal.
- `dom_days < 60` (applied in US4.3, stored now) is an acceptable plausible-sale filter.

## Out of scope (this phase)

- Computing `k` (US4.3) and applying it (US4.4) — later phases of this spec.
- 404-confirmed removal (needs a source change — the E2c-later note stands for *confirmation*;
  grace-based detection supersedes it for *data collection*).
- Hiding `removed` listings from `/best`/`/top`/near-misses — noted as a follow-up task.

## Related

- Backlog SPEC-004 (epic "Оцінка вигідності v2") · ADR-0005 (ParameterSets) ·
  ADR-0006 (vision) · ADR-0009 (monthly pool)
- Vault: profitability-definition · glossary · backlog
