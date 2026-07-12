# Phase 0 Research — Profitable Listing Alerts

Decisions that resolve the technical unknowns before design. Format: Decision / Rationale /
Alternatives. Foundational investigation lives in the vault:
`knowledge-offers-analyzer/research/monitoring-approaches.md` and `.../profitability-definition.md`.

## R1. Data source & ingestion

- **Decision**: AUTO.RIA official API only (`/auto/search` → ids, `/auto/info` → details,
  `/auto/average_price` → fair value), behind a `ListingSource` port. Reference dictionaries
  (marks/models/states/cities) fetched once and cached.
- **Rationale**: legal, stable JSON, free average-price benchmark; scraping breaks ToS and is
  brittle (ADR-0002).
- **Alternatives**: headless scraping (rejected), hybrid (deferred).

## R2. Respecting the ~30 req/hour budget

- **Decision**: a **token-bucket rate budget** persisted in Redis (configurable capacity/refill),
  consumed by a **BullMQ rate-limited queue**. `@nestjs/schedule` cron enqueues per-niche poll
  jobs; workers spend budget in priority order: `search` (paged) → `info` for **new** ids only →
  `average_price` per cohort (cached per cohort/day). Dictionaries never spend the live budget.
- **Rationale**: hard external cap must be enforced centrally with backpressure, not per-caller.
- **Alternatives**: naive cron with sleeps (no backpressure, races); per-request limiter only
  (can't coordinate across job types).

## R3. Fair value, confidence & red-flags (valuation)

- **Decision**: `fair_value` = RIA average price for the listing's cohort (make/model/year/region/
  mileage band). `discount = (fair_value − asking)/fair_value`. **Confidence** = sample size behind
  the average (from the average-price response and/or our stored comparables) vs a configurable
  minimum. **Red-flags** are a configurable rule set (damaged / unclear customs / failed-or-missing
  VIN report via `linkToReport` / discount > suspicious cap). Opportunity requires
  `discount ≥ profile.threshold` AND confidence OK AND no disqualifying flag; score = `discount ×
  confidence`. All thresholds are config.
- **Rationale**: matches the agreed methodology; keeps tuning out of code (Principle III).
- **Alternatives**: own median from stored history (planned next iteration once data accrues);
  resale-margin model (later — needs cost/liquidity data).

## R4. Deduplication & relist detection

- **Decision**: primary key on `(source, externalId)` prevents re-alerting the same ad. Relist
  heuristic: match on VIN when present; else `(make, model, year, mileage±, sellerPhoneHash)`.
  Price changes recorded as `PriceObservation`; a drop into range is a distinct event.
- **Rationale**: same car under a new id must not read as "new"; avoids notification spam (FR-008/009).
- **Alternatives**: id-only dedup (misses relists); photo-hash matching (heavier — deferred).

## R5. Notifications (Telegram)

- **Decision**: `nestjs-telegraf`. A `Notifier` port abstracts delivery. Messages include asking,
  fair value, discount %, confidence, red-flags checked, and the **AUTO.RIA backlink** (also
  satisfies ToS). `Notification` rows carry a unique `dedupKey` for idempotency. Bot commands:
  subscribe / unsubscribe / mute / list profiles.
- **Rationale**: mature NestJS integration; port keeps channel swappable.
- **Alternatives**: grammY (fine; less Nest-native), raw Bot API (more glue).

## R6. Currency normalization

- **Decision**: `ExchangeRate` port with an **NBU (National Bank of Ukraine)** adapter, refreshed
  daily and cached; all prices normalized to a canonical currency for comparison, display currency
  switchable per profile.
- **Rationale**: official, free, UAH-authoritative; sellers quote UAH/USD (FR-014).
- **Alternatives**: hardcoded rate (stale), paid FX API (unneeded).

## R7. Testing the external API

- **Decision**: record real AUTO.RIA responses once into fixtures; replay with `nock` in contract
  tests. Tests never hit the live rate-limited endpoint. Valuation/dedup/budget logic unit-tested.
- **Rationale**: Principle VI; protects the 30/hr budget and the core logic.
- **Alternatives**: live calls in CI (rejected — burns budget, flaky).

## R8. Configuration & secrets

- **Decision**: `@nestjs/config` with `.env` (already gitignored). API key, bot token, DB/Redis
  URLs, NBU endpoint, and default thresholds are configuration. SearchProfiles stored in DB.
- **Rationale**: Principle V (no secrets in code); profiles are user-tunable data.
- **Alternatives**: config in code (rejected).

## Open items carried into tasks

- Exact cohort→`average_price` parameter mapping (marka_id/model_id/city_id/raceInt) validated
  against live samples during implementation.
- Confidence source: prefer the average-price sample count if exposed; otherwise fall back to our
  stored comparable count.
