# Feature Specification: Profitable Listing Alerts

**Feature Branch**: `001-profitable-listing-alerts`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Monitor configured AUTO.RIA search profiles and notify subscribers via Telegram about profitable car listings (priced below fair market value, low risk)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get alerted to a profitable listing (Priority: P1)

A user has told the system which kind of cars to watch (a niche). When a listing appears in that niche that is priced meaningfully below the fair market value for that kind of car — and it is not obviously risky — the user receives a Telegram message quickly, so they can act before the deal is gone.

**Why this priority**: This is the whole point of the product. On its own it delivers the core value: being first to a good deal. Everything else refines it.

**Independent Test**: Configure one niche, feed the system a listing priced well below the market average for its cohort, and confirm a Telegram alert arrives naming the discount — while a fairly-priced listing produces no alert.

**Acceptance Scenarios**:

1. **Given** an active niche and a new listing whose asking price is ≥ the niche's discount threshold below its fair market value, with enough comparable data and no red flags, **When** the system checks the niche, **Then** the subscriber receives one Telegram alert for that listing.
2. **Given** a new listing priced at or above fair market value, **When** the system checks the niche, **Then** no alert is sent.
3. **Given** a listing below fair value but with a disqualifying red flag (e.g. damaged, unclear customs, failed VIN report), **When** the system evaluates it, **Then** no alert is sent (or it is clearly marked as risky, per configuration).

---

### User Story 2 - Control what I watch and how strict it is (Priority: P2)

The operator manages one or more watch niches and tunes how the system decides what counts as "profitable" — the region, makes/models, price band, discount threshold, how dealers are treated, and the comparison currency — and can pause a niche. In v1 this configuration is operator-side (config/admin); end users interact only via subscribe/mute (US1, FR-015).

**Why this priority**: Without user control the alerts are either too noisy or miss the target. This turns the fixed P1 flow into something each user can shape. It also removes any need to commit to a single niche up front.

**Independent Test**: Create two niches with different thresholds and dealer policies, confirm each produces alerts matching its own settings, and confirm disabling a niche stops its alerts.

**Acceptance Scenarios**:

1. **Given** a niche with threshold 20%, **When** a listing is 18% below fair value, **Then** no alert; **When** another is 22% below, **Then** an alert.
2. **Given** a niche whose dealer policy is "exclude", **When** a matching listing is from a dealer, **Then** it is not alerted; **Given** policy "label", **Then** it is alerted but marked as a dealer listing.
3. **Given** a niche is disabled, **When** the system runs, **Then** it produces no alerts for that niche.

---

### User Story 3 - Understand and trust each alert (Priority: P3)

Each alert explains *why* the listing was flagged — asking price vs fair market value, the discount, how confident the estimate is, and which risk checks passed — and links back to the original listing, so the user can judge it in seconds and avoid scams.

**Why this priority**: A number with no reasoning is untrustworthy and gets ignored. Explanation is what makes the user act. It builds on P1/P2 rather than standing alone.

**Independent Test**: Trigger an alert and verify the message contains asking price, fair value, discount %, a confidence indication, the risk checks performed, and a working link to the listing.

**Acceptance Scenarios**:

1. **Given** an Opportunity is found, **When** the alert is sent, **Then** it includes asking price, fair market value, discount %, confidence, red-flags checked, and a link to the source listing.
2. **Given** a listing whose discount is implausibly large (likely a scam), **When** it is evaluated, **Then** it is suppressed or flagged as suspicious rather than presented as a jackpot.

---

### Edge Cases

- **Thin cohort**: too few comparable listings to trust the fair-value estimate → the listing is not alerted (confidence gate), not surfaced with a misleading discount.
- **Source budget exhausted**: the hourly request budget runs out → the system degrades gracefully (defers work), never breaches the limit, and warns the operator.
- **Source unavailable**: the data source is down or errors → the system retries with backoff and does not crash or lose already-seen state.
- **Relisted / duplicate car**: the same car reappears under a new listing id → it is recognized and not alerted again as if new.
- **Sold/removed between detection and send**: a listing disappears before or just after alerting → handled without error; the alert may note it if known.
- **Missing/one-sided currency**: a listing quotes only one currency → prices are normalized via the maintained exchange rate before comparison.
- **Price drop on a known listing**: an already-seen listing drops into "profitable" range → treated as a (configurable) price-drop event, without duplicating the original alert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to define one or more **watch niches (search profiles)**, each describing what to monitor: source, region, make(s)/model(s), and price band.
- **FR-002**: System MUST periodically discover new and updated listings matching each active niche from the configured source (AUTO.RIA for v1).
- **FR-003**: System MUST estimate a **fair market value** for each candidate listing from the prices of comparable listings (same make/model/year/region/mileage cohort).
- **FR-004**: System MUST compute a **discount** = (fair value − asking price) / fair value for each candidate.
- **FR-005**: System MUST compute a **deal score** in the range **[−1, 1]** for each candidate (−1 = clearly overpriced/trap, 0 = at market or unknown, +1 = clearly below market) from the discount vs fair value, weighted by **confidence** (comparable-data sufficiency) and adjusted by risk red-flags. It MUST flag a listing as an **Opportunity** only when the deal score ≥ the niche's configured minimum **and** comparable data is sufficient **and** no disqualifying red-flag fired.
- **FR-006**: System MUST apply **configurable risk red-flags** that suppress or down-rank a listing (e.g. damaged/after-accident, unclear customs status, missing/failed VIN report, implausibly large discount).
- **FR-007**: System MUST notify subscribers of each new Opportunity via **Telegram**, including the reason (asking price, fair value, discount %, confidence, red-flags checked) and a link back to the original listing.
- **FR-008**: System MUST NOT alert about the same listing more than once as new, and MUST recognize relisted/duplicate listings.
- **FR-009**: System MUST detect significant **price drops** on already-seen listings and MAY notify them as a distinct, configurable event.
- **FR-010**: The **operator** MUST be able to configure, **per niche** (via configuration in v1): minimum deal score, dealer policy (`label` / `exclude` / `ignore`), comparison currency (switchable), and enabled/disabled state. (End-user-facing profile management UI is out of v1 scope.)
- **FR-011**: System MUST store listings and their observed prices **over time** (history), from first observation.
- **FR-012**: System MUST operate within the source's **usage limits and Terms** (request budget, required backlink), degrade gracefully, and alert the operator when the budget is exhausted or the source is unavailable.
- **FR-013**: System MUST **rank** surfaced Opportunities by their deal score (higher = better deal).
- **FR-014**: System MUST **normalize prices across currencies** using a maintained exchange rate.
- **FR-015**: Users MUST be able to **subscribe, unsubscribe, and mute** notifications via the Telegram bot.

### Key Entities *(include if feature involves data)*

- **SearchProfile (niche)**: what to monitor and how strict — source, region, makes/models, price band, threshold, dealer policy, currency, enabled flag.
- **Listing**: a single car advertisement from a source — identity, specs (make/model/year/mileage/region), seller type, current asking price, link.
- **PriceObservation**: a listing's price at a point in time (history; enables price-drop detection and own statistics).
- **FairValueBenchmark**: the estimated market value for a cohort plus the sample size behind it (drives discount and confidence).
- **Opportunity**: a listing flagged as a candidate deal — discount, confidence, red-flag results, score.
- **Subscriber**: a Telegram user and their subscription/mute state.
- **Notification**: a message sent to a subscriber about an Opportunity or price drop (for idempotency/dedup).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A newly published listing that meets an active niche's criteria produces a Telegram alert within **15 minutes** of becoming visible to the source.
- **SC-002**: **100%** of alerts include the reasoning fields (asking price, fair value, discount %, confidence, red-flags) and a working link to the listing.
- **SC-003**: **Zero** duplicate initial alerts — the same listing is never alerted as new more than once.
- **SC-004**: **Zero** alerts for listings whose comparable data is below the confidence threshold.
- **SC-005**: The system stays within the source request budget **100%** of the time (no rate-limit breaches).
- **SC-006**: In steady state, **≥ 70%** of alerts are rated useful (a real, non-scam, below-market deal) by the user over a review period.

## Assumptions

- v1 uses the **AUTO.RIA official API as the only source**; additional sources come later behind the same source abstraction.
- The **niche is user-configured**; the system ships the mechanism (and may seed one example profile) — no fixed niche is baked in.
- Fair value is anchored on the source's **average-price benchmark** for v1; a more robust own-statistics estimate (median/percentiles from stored history) comes later.
- "**Profitable**" in v1 means a **below-fair-value opportunity (a lead worth a human look)**, not a guaranteed resale profit; a resale-margin model (minus costs) is a later iteration.
- v1 runs on the **free API tier (~30 requests/hour)**; wider coverage requires a paid tier (out of scope for v1).
- **Telegram** is the only notification channel for v1.
- v1 serves a **small number of users** (single operator / small group).

## Dependencies

- Access to the AUTO.RIA official API (valid API key) and adherence to its Terms (including the required backlink).
- A Telegram bot token for delivering notifications.
- A maintained source of currency exchange rates (UAH/USD) for price normalization.
