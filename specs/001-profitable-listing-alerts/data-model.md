# Phase 1 Data Model — Profitable Listing Alerts

Entities, key fields, relationships, and validation. Storage: PostgreSQL via TypeORM. Money is
stored as amount + currency, plus a normalized `amountUsd` (or canonical) via the FX rate.
Domain terms: `knowledge-offers-analyzer/domain/glossary.md`.

## SearchProfile

The configured niche and its tuning. Source of the "user-controlled" parameters.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | string | human label |
| sourceKey | string | e.g. `auto-ria` |
| categoryId | int | vehicle type (cars = 1) |
| stateId | int? | region |
| cityId | int? | optional narrower |
| filters | jsonb | make/model pairs, year range, mileage range |
| priceFrom / priceTo | int? | price band |
| currency | enum(`USD`,`UAH`) | display/compare currency (switchable) |
| discountThresholdPct | numeric | e.g. 15.0 |
| confidenceMinSamples | int | minimum comparables to trust fair value |
| dealerPolicy | enum(`label`,`exclude`,`ignore`) | |
| enabled | bool | pause switch |
| createdAt / updatedAt | timestamptz | |

Validation: `priceFrom ≤ priceTo`; `discountThresholdPct` in (0,100); at least one make/model.

## Listing

A car advertisement observed from a source.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | internal |
| sourceKey | string | |
| externalId | string | AUTO.RIA `auto_id` |
| make / model | string | resolved from dictionaries |
| year | int | |
| mileage | int? | thousand km |
| stateId / cityId | int? | region |
| sellerType | enum(`private`,`dealer`,`unknown`) | |
| vin | string? | from info (`linkToReport`) |
| url | string | AUTO.RIA backlink (ToS) |
| currentAmount / currentCurrency | money | latest asking price |
| status | enum(`active`,`removed`,`sold`) | |
| firstSeenAt / lastSeenAt | timestamptz | |

Constraints: **unique `(sourceKey, externalId)`** (dedup, FR-008). Index on `(make,model,year,stateId)`.

## PriceObservation

Price history for a listing (drop detection + own statistics).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| listingId | uuid (FK → Listing) | |
| amount / currency | money | |
| amountUsd | numeric | normalized via FX |
| observedAt | timestamptz | |

Index on `(listingId, observedAt)`.

## FairValueBenchmark (cache)

Cached cohort valuation to avoid spending budget repeatedly.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| cohortKey | string | deterministic hash of cohort params |
| sourceKey | string | |
| value / currency | money | RIA average |
| sampleSize | int | drives confidence |
| computedAt | timestamptz | |
| expiresAt | timestamptz | TTL (e.g. daily) |

Unique on `(sourceKey, cohortKey)`.

## Opportunity

A listing flagged as a candidate deal.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| listingId | uuid (FK) | |
| profileId | uuid (FK) | which niche matched |
| fairValue / currency | money | |
| askingValue | money | at flag time |
| discountPct | numeric | |
| confidence | numeric | 0..1 or sample-based |
| score | numeric | discount × confidence |
| redFlags | jsonb | which checks fired |
| createdAt | timestamptz | |
| notified | bool | |

Rule: created only when `discountPct ≥ profile.discountThresholdPct` AND confidence ≥ min AND no
disqualifying flag (FR-005).

## Subscriber

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| telegramChatId | string (unique) | |
| state | enum(`active`,`muted`,`unsubscribed`) | |
| profileIds | uuid[]? | which niches they follow (v1 may be all) |
| createdAt | timestamptz | |

## Notification

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| subscriberId | uuid (FK) | |
| opportunityId | uuid (FK) | |
| type | enum(`opportunity`,`price_drop`) | |
| dedupKey | string (unique) | idempotency (FR-008/009) |
| sentAt | timestamptz | |

## Relationships

- SearchProfile 1—N Opportunity; SearchProfile N—M Subscriber (via `profileIds`).
- Listing 1—N PriceObservation; Listing 1—N Opportunity.
- Opportunity 1—N Notification; Subscriber 1—N Notification.
