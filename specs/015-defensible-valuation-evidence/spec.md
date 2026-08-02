# Feature Specification: Defensible valuation evidence

**Feature Branch**: 015-defensible-valuation-evidence
**Created**: 2026-08-02
**Status**: Draft
**Input**: An Audi A6 Allroad was assessed as a 26.7% bargain from a $6,825 legacy benchmark even though AUTO.RIA displayed an active-market range of $4,882-$5,395. The operator needs a defensible estimate of active comparable asking prices, while any resale-price claim remains evidence-gated.

## Product Boundary

This feature produces an **active-market asking-price estimate**: what comparable cars are actively advertised for at the recorded timestamp. It is provider evidence for an operator, not a claim that the car will sell for that price.

- **Active-market estimate**: current comparable advertised prices; the sole value target in this feature.
- **Likely transaction price**: expected completed-sale price; requires confirmed transaction data or sufficient closed operator deals and is not produced here.
- **Quick-exit price**: price needed to sell within a specified horizon and probability; requires longitudinal exit data and is not produced here.
- **Safe buy ceiling**: a risk-adjusted purchase limit after repair, holding, and margin assumptions; depends on a validated transaction or quick-exit model and is not produced here.

The current legacy fair-value calculation, discount, score, ParameterSet, alert threshold, survivorship correction k, and inactive factors remain unchanged during this shadow release. New surfaces must not call an active-market estimate a real market price, resale price, transaction price, or a replacement for legacy fair value.

## User Scenarios & Testing

### User Story 1 - Inspect a provider-backed active-market estimate (Priority: P1)

As an operator, when I manually check a listing or the existing legacy flow selects it for shadow evaluation, I can inspect a separately labelled AUTO.RIA provider active-market estimate with its exact vehicle inputs, query mode, source time, comparable evidence, available range/distribution, and valuation-policy version.

**Why this priority**: A useful valuation begins with an auditable source and explicit semantics. A bare median cannot explain the Audi mismatch or support a later rollout decision.

**Independent Test**: Given a sanitized recorded provider response for a fully identified listing, the operator can read an immutable active-listing evidence record containing the central estimate, any provider-supplied range/distribution, source timestamp, request inputs, comparable summary, and provenance. The legacy score stays byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** an enabled provider and a listing with usable source identity, **When** a shadow lookup succeeds, **Then** the system stores and renders an active-market asking-price estimate with its source, query mode, policy and adapter versions, request inputs, comparable summary, central estimate, and available spread/range.
2. **Given** a response that supplies only a provider central estimate, **When** it is stored, **Then** the explanation says no range is available rather than inventing one from incomplete data.
3. **Given** an existing legacy opportunity, **When** shadow evidence is collected, **Then** its legacy benchmark, score, opportunity decision, and notification behavior are unchanged.
4. **Given** provider access is not configured or the feature is disabled, **When** the listing is evaluated, **Then** no paid valuation request is made and the durable shadow state says not configured.

---

### User Story 2 - Fail closed when comparison is weak (Priority: P1)

As an operator, I see review, unavailable, or deferred rather than a deceptively confident estimate when the source lacks critical vehicle identity, comparable evidence is thin, an important dimension is relaxed, or the request cannot safely run.

**Why this priority**: The damaging failure is a broad fallback being presented as precise evidence. Every materially missing or relaxed comparison dimension must be visible.

**Independent Test**: A fixture missing a policy-required field, using an attribute query without mileage, or receiving an incomplete source response produces a persisted non-eligible decision naming its exact limitation. It cannot be treated as a trusted value.

**Acceptance Scenarios**:

1. **Given** generation, modification, body, drivetrain, fuel, gearbox, mileage, location, VIN-evidence state, or condition evidence is unavailable or ignored, **When** that fact affects comparability, **Then** the evidence names it as missing or relaxed rather than treating the match as exact.
2. **Given** a policy-required identity field, mileage in attribute mode, or required provenance is absent, **When** a provider request is considered, **Then** the system records invalid input or review and does not make an over-broad attribute request.
3. **Given** budget denial, rate limiting, permission failure, timeout, malformed payload, or no usable estimate, **When** the attempt ends, **Then** it has a distinct durable deferred or unavailable reason and no substitute valuation is fabricated.
4. **Given** a provider central estimate and legacy benchmark both exist, **When** the operator opens the evidence, **Then** both values and their percentage difference are shown for audit without changing the legacy score.
5. **Given** an AUTO.RIA listing ID is available but the local parser lacks some optional attributes, **When** the approved ID query is allowed by policy, **Then** the lookup is labelled ID-resolved with input completeness visible; it is not represented as a complete attribute match.

---

### User Story 3 - Reproduce and audit historical evidence (Priority: P2)

As an operator or release steward, I can use /why and a read-only valuation audit to inspect evidence captured at evaluation time, group outcomes by quality and discrepancy, and decide whether a separately approved live-policy proposal has earned review.

**Why this priority**: Later scoring changes are safe only if historical evidence can be re-read without a fresh source call and evaluated against a declared representative corpus.

**Independent Test**: After provider access is removed, /why for a previously evaluated listing renders its stored shadow result with no outbound request. A read-only audit groups a declared gold-case corpus by quality state, lookup mode, coverage, and discrepancy bucket.

**Acceptance Scenarios**:

1. **Given** stored provider evidence, **When** /why is requested later, **Then** it renders the frozen target label, source time, query mode, input completeness, policy version, comparable summary, decision, and reason without refetching a source.
2. **Given** a stored unavailable or deferred attempt, **When** /why is requested, **Then** the terminal reason is shown alongside the unchanged legacy explanation.
3. **Given** the declared gold-case corpus, **When** the release steward runs the audit, **Then** it reports coverage, decision states, input completeness, source health, and discrepancy buckets including every review, unavailable, deferred, and difference of at least 20% from the provider central estimate.
4. **Given** shadow evaluation has completed, **When** a policy is proposed for live use, **Then** the audit remains evidence only; operator approval and the existing ADR-0011 gates are still required before any score, threshold, factor, or k change.

### Edge Cases

- A vehicle cannot be mapped to valid provider identity: persist invalid input, review, or unavailable; never broaden it to a make-model average without recording the relaxation.
- The source returns no comparable data, malformed prices, stale timestamps, or a partial response: preserve the terminal reason and do not calculate a synthetic range or confidence.
- Repeated or concurrent lookup of an identical fingerprint: create one provider call and link all consumers to immutable evidence; later evidence must not overwrite earlier policy versions.
- A source response contains seller or other personal data: retain only the minimum permitted normalized evidence summary and integrity hash; never persist credentials or unnecessary PII.
- The provider is slower, rate-limited, or unavailable: defer work through the shared budget and preserve core discovery, existing alerts, and legacy explanation.
- Old, niche, high-mileage, damaged, and condition-ambiguous vehicles are required audit strata, not grounds to fabricate a transaction or resale result.

## Requirements

### Functional Requirements

- **FR-1501**: Every new valuation record MUST name its value target. This feature MUST use only active_listing_ask and MUST NOT relabel it as fair value, likely transaction price, quick-exit price, resale price, or buy ceiling.
- **FR-1502**: The system MUST add an approved first-party AUTO.RIA AI valuation provider behind a dedicated provider contract. It MUST prefer an AUTO.RIA listing-ID lookup when available; attribute mode MUST have a policy-defined required fact set, including actual mileage.
- **FR-1503**: Provider valuation MUST run only in a shadow path: automatically for a deterministic, policy-selected sample of legacy candidates and on an explicit manual check. The automatic path MUST be low priority, bounded by a feature allocation, and disabled by default.
- **FR-1504**: Every selected, admitted, deferred, disabled, or failed lookup MUST persist an immutable attempt/evidence record with listing identity, source identity, target, query mode, policy and adapter versions, timestamps, status, request fingerprint, and an explicit reason.
- **FR-1505**: A successful evidence record MUST preserve the vehicle facts supplied to the provider and their provenance/availability: make/model/year plus generation, modification, body, fuel, gearbox, drivetrain, mileage, location, VIN-evidence state, and condition evidence where available.
- **FR-1506**: A successful record MUST preserve the provider-declared central estimate, currency, source timestamp, returned comparable summary and statistics where available, query criteria, response fingerprint, and a redacted integrity projection. It MUST say when a range/distribution, comparable count, or field is not supplied.
- **FR-1507**: The policy MUST assign an explicit comparability decision. Eligible requires policy-required identity, provenance, valid provider data, and adequate comparable evidence. Missing hard fields, an attribute query without mileage, a relaxed material dimension, or inadequate evidence MUST yield review or invalid input. No usable provider result MUST yield unavailable or deferred.
- **FR-1508**: The system MUST record and render every relaxed, omitted, unmatched, or stale dimension and the percentage difference between provider estimate and legacy benchmark when both exist. A failed AI request MUST NOT silently fall back to the deprecated legacy average-price endpoint.
- **FR-1509**: /why MUST read stored provider evidence without making a source request and present it alongside, but clearly separate from, the immutable legacy evaluation explanation.
- **FR-1510**: All provider calls, including bounded retries, MUST pass through the shared rate-budget service and immutable budget ledger as a distinct valuation_ai operation. Denial, 429, failure class, retry, cache/dedup result, expected cost, and charge-unknown status MUST be observable.
- **FR-1511**: The provider integration MUST use operator-authorized credentials and permissions only. It MUST not scrape, bypass terms, send credentials or raw VIN/plate data to logs/explanations, or persist unnecessary personal data.
- **FR-1512**: A read-only audit MUST use a predeclared gold-case corpus covering old, niche, high-mileage, dealer/private, regional, VIN-unverified, and condition-ambiguous listings. It MUST group selection coverage, source health, quality decision, and differences of at least 20% from the provider central estimate for classification.
- **FR-1513**: This feature MUST NOT change legacy fair value, score, rank, opportunity qualification, alert threshold, ParameterSet, factor activation, survivorship correction k, notification timing, or price-drop behavior. A future live-policy proposal requires a separate approved decision and ADR-0011 evidence gates.

### Key Entities

- **Valuation provider**: A versioned external source contract that produces an active-market provider estimate without claiming a completed sale.
- **Valuation evidence**: An immutable result of one valuation attempt, including input fact snapshot, request/response provenance, quality decision, terminal state, and redacted comparable evidence.
- **Valuation policy version**: A versioned immutable definition of hard matching fields, query rules, allowable relaxations, quality rules, cache freshness, sampling, and discrepancy buckets. It is separate from a scoring ParameterSet.
- **Valuation audit case**: A declared reference listing used to test shadow coverage and classify disagreements. A public page observation is a diagnostic comparison, not a completed-sale label.

## Success Criteria

### Measurable Outcomes

- **SC-1501**: 100% of selected shadow attempts have a durable target, policy/adapter version, timestamp, query mode, status, and reason. Successful attempts additionally contain the evidence required by FR-1505 and FR-1506.
- **SC-1502**: 100% of eligible records contain all policy-required identity and provenance fields. Tests prove that an attribute lookup with missing mileage or a relaxed material field cannot yield eligible.
- **SC-1503**: 100% of /why calls for listings with stored shadow evidence render it without an outbound valuation-source request.
- **SC-1504**: In regression tests covering a legacy opportunity, toggling shadow evidence causes zero changes to its legacy benchmark, score, rank, opportunity decision, threshold, and notification decision.
- **SC-1505**: 100% of provider source attempts produce a corresponding allowed or denied BudgetActivity. No provider request bypasses monthly capacity, cooldown, source pause, or feature allocation.
- **SC-1506**: Concurrent identical policy/input requests produce one provider request and a shared immutable evidence reference; failure/retry paths remain idempotent.
- **SC-1507**: The gold-case corpus includes every category in FR-1512, and each review, unavailable, deferred, and >=20% disagreement is classified in its audit report before a live-policy proposal is considered.
- **SC-1508**: Contract and fixture tests reproduce the recorded provider estimate, exact query mode, redacted request projection, field completeness, and quality decision. No test treats active listing asks as completed-sale ground truth.

## Assumptions

- The operator will obtain the first-party AUTO.RIA AI valuation permission, user identifier, API credential, and storage/attribution approval before enabling this feature. Access is paid/controlled and optional in every environment.
- The initial provider is AUTO.RIA's supported AI valuation interface. The current legacy average-price endpoint is a separately labelled baseline; it is not an AI failure fallback.
- The provider may return comparable listings and a provider statistic rather than a completed-sale distribution. The system may retain only permitted normalized summaries and must not substitute its own average when the canonical provider estimate is absent.
- A 20% difference is an audit-review bucket, not an accuracy claim or automatic scoring rule.
- AUTO.RIA active listings are useful market-position evidence, but completed-sale and resale data are not assumed by this feature.

## Out of Scope

- Predicting likely transaction price, quick-exit price, resale price, buy ceiling, profit, repair cost, holding cost, or sale probability.
- Replacing the price core, changing a live opportunity or notification decision, or tuning a ParameterSet from provider results.
- Applying survivorship correction k, treating disappearance as a sale, or activating composite factors.
- Scraping AUTO.RIA, adding a non-approved listing source, or sending raw provider payloads/credentials to Telegram.
- Automatic rollout from shadow evidence to live scoring. That needs actual-outcome validation, a separate approved decision, and operator approval.

## Related

- specs/004-realized-price-calibration: active-listing survivorship research; disappearance is not a confirmed transaction.
- specs/007-deal-outcomes: the future source of real operator economics.
- specs/011-valuation-sanity-guards: live median/mileage safeguards that remain unchanged.
- ADR-0010 and ADR-0011: factor activation and evidence-gated scoring rollout.
