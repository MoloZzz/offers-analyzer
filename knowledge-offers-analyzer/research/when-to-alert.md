---
title: Research — when is a listing "worth alerting" (interestingness + relist de-dup)
type: research
status: Proposed
updated: 2026-07-17
---

# When do we alert the operator? (interestingness & relists)

> Two rules in tension: **don't lose a good deal** and **don't spam the operator**. A blunt "de-dup by
> id" breaks the first (a relisted car that got *cheaper* is a better deal — we should alert). So we must
> define **interesting = worth alerting** precisely. Related: [[profitability-definition]], B12.

## The definition — alert only when BOTH hold

**A listing is worth alerting when it is (1) a genuine deal AND (2) new information for the operator.**

1. **Genuine deal** (already implemented): `score ≥ profile threshold` **and** enough comparable data
   **and** no disqualifying red-flag. If it's not a deal, we never alert (it still shows in `/best` /
   `/report`, which aren't alerts, so no spam).
2. **New information about *this specific car*** (the missing piece, B12):
   - **First time** we've seen this car → alert; **or**
   - It's a car we already alerted, but the asking price is now **strictly lower** than the best (lowest)
     price we ever alerted for it → alert (a *better* deal than the operator already knows).
   - Otherwise (same car, same-or-higher price than we already flagged) → **suppress** — the operator
     already has this, nothing new.

Plus the existing idempotency: never alert the **same listing id / opportunity** twice.

This makes the relist case correct both ways: a car reposted **cheaper** and still a deal → we alert
(labelled "знову в продажу, дешевше"); reposted at the **same/higher** price → silent.

## Identifying "the same car" across listing ids

Sellers delete + repost, so the same car gets a **new `externalId`**. To recognise it:

- **Primary key = VIN** (normalised: upper-case, trimmed). Exact and reliable; AUTO.RIA `/info` gives it
  for most listings.
- **No VIN** → we cannot safely say it's the same car, so we **fall back to today's per-listing
  behaviour** (treat as new). Accept the small relist-spam risk here; `no_vin_report` already penalises
  such listings, so they alert less anyway. (A fuzzy fingerprint — make+model+year+mileage+city — is
  possible but risks merging two genuinely different identical cars; deferred.)

## Tracking "already alerted, at what price"

Small table **`alerted_cars`**: `{ carKey (VIN), lowestAlertedAmount, currency, lastListingId,
lastAlertedAt }`. On every alert with a VIN: look it up; decide per the rule above; upsert the new
lowest. Fast, tiny, and it's also a clean audit of "which cars we've told the operator about".

## Decision flow (in `evaluateAndNotify`, once `isOpportunity`)

1. `carKey = normalizeVin(detail.vin)`. If empty → alert as today (no cross-listing de-dup).
2. Look up `alerted_cars[carKey]`.
   - none → **alert** (first sighting); insert `lowestAlertedAmount = asking`.
   - exists and `asking < lowestAlertedAmount` → **alert** ("знову в продажу, дешевше"); update lowest.
   - exists and `asking ≥ lowestAlertedAmount` → **suppress**.

## Edge cases

- **Price-drop on the *same* listing id** already has its own alert path — unchanged; it also updates the
  car's lowest so relists are compared fairly.
- **Currency**: compare within the profile currency (we already convert to it before storing amounts).
- **VIN missing then present** (seller adds VIN on repost) → treated as first sighting of that VIN; minor,
  acceptable.
- **Same car, two active profiles**: the car-level de-dup is global (by VIN), so the operator gets one
  alert, not one per niche — desirable.

## Decided (operator, 2026-07-17)

1. **Identity: VIN-only.** No-VIN listings fall back to today's per-listing behaviour (not de-duped).
2. **"Cheaper again" baseline: lower than the lowest we ever alerted** for that car (least spam).

Comparison is done in **USD** (the source price is USD), so relists compare cleanly regardless of the
profile's display currency.

## Related
- [[profitability-definition]] · [[how-it-works]] · [[backlog]]
