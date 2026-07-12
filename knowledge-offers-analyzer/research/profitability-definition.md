---
title: Research — what counts as a "profitable" offer
type: research
status: Proposed (needs your review)
updated: 2026-07-12
---

# Research — defining a "profitable" offer

> Question: what makes a listing "profitable/advantageous", and why? This is the core domain definition. Depends on data from [[monitoring-approaches]]. Terms feed [[glossary]].

## What "profitable" really means

A listing is worth surfacing when its **asking price is meaningfully below the fair market value** of comparable cars **and** the risk it's a trap (scam/damaged/hidden costs) is low. True profit is the **expected resale margin**, but a full margin model needs resale-cost data we won't have on day one — so v1 approximates it with a **below-market opportunity score + risk filter**, and we evolve toward true margin later.

## Data we can use

- **RIA average price** (`/auto/average_price`) — first-party market average for a cohort (make, model, city, mileage range, options), in UAH & USD. This is our fair-value anchor.
- **RIA AI trend** (`/auto/statistic-avarage-price/`) — average over time → is the segment rising/falling.
- **Listing detail** (`/auto/info`) — asking price, year, mileage, options, seller type, VIN-report link (`linkToReport`).
- **Our own history** — as we store listings, we can compute our own median/percentiles per cohort (more robust than a single average).

## Fair value & the opportunity score

```
fair_value(FV)  = RIA average price for the listing's cohort
                  (optionally adjusted for mileage/options/condition vs the cohort)
discount        = (FV − asking_price) / FV
```

Flag as a **candidate** when **all** hold:
- `discount ≥ THRESHOLD` (start ~15–20%),
- **confidence** is sufficient — the cohort has enough comparable listings behind the average (small samples lie),
- it passes **risk red-flags** (below).

Score/rank candidates by `discount × confidence` (and later: minus expected costs).

## Worked example (what the system actually does)

1. It sees an ad: **VW Passat B8, 2017, 150 000 km, Kyiv — asking $13 000**.
2. It asks the RIA average-price API for the **same cohort** (Passat B8, 2017, similar mileage, region) → average ≈ **$16 000** (this is `fair_value`; we do **not** invent it).
3. `discount = (16 000 − 13 000) / 16 000 = 18.75%`.
4. Threshold check: if the profile's threshold is 15% → **passes**; if 20% → doesn't.
5. Confidence check: how many comparable ads formed that $16k average? 3 ads → too weak, skip; 50 ads → trust it.
6. Red-flag check: damaged / unrastamozhena / VIN issues / *too* cheap (e.g. `discount > 45%` → likely scam) → drop or down-rank.
7. If it survives → it's an **Opportunity**, ranked by `discount × confidence`, and pushed to Telegram.

Plain words: **"cheaper than the market average for the same kind of car, with enough data to trust that average, and no red flags."** It is a *lead worth a human look*, not a guaranteed profit — true resale margin (minus costs) comes in a later iteration.

## Risk red-flags (why "cheap" is often not profitable)

Cheap-vs-average is frequently a **scam, damaged, or high-friction** car. Filter/penalize:
- damaged / after-accident / "на запчастини", salvage;
- customs status «нерозмитнена» / unclear paperwork;
- price *drastically* below FV (e.g. `discount > 45%`) → treat as suspicious, not a jackpot;
- dealer vs private mismatch, brand-new account, no VIN report / bad VIN report;
- mileage implausibly low for year; stale or repeatedly relisted ad.

## Known pitfalls of the average-price anchor

- The average can be dragged by **overpriced stale listings** or by **damaged cheap** ones → prefer **median/percentiles** from our own data once we have volume.
- **Regional** price variance (Kyiv ≠ regions) — always compare within region/city.
- **Currency**: normalize UAH/USD with a stored FX rate; sellers quote both.
- **Cohort granularity**: too broad (whole model) hides trims; too narrow starves the sample. Tune per niche.

## Options for the v1 definition

| Approach | What it is | Pros | Cons |
|---|---|---|---|
| **1. Below-average + threshold + red-flags** *(recommended v1)* | Compare asking vs RIA average; flag by discount; filter risk | Fast; uses free first-party benchmark; explainable | Average is a blunt anchor; no true margin |
| 2. Own-statistics model | Build median/percentiles from our stored cohort | More robust than a single average; regional/trim aware | Needs accumulated data before it's useful |
| 3. Net-margin resale model | Expected margin = FV − asking − costs (fees, repair, time-to-sell, FX) | Closest to "profit" | Needs cost/liquidity data & tuning; slowest |

## Recommendation

**v1 = Option 1**, engineered to grow into 2 then 3:
- Anchor on RIA average now; **also start storing listings from day one** so Option 2's own-statistics can switch on without rework.
- Keep the formula, thresholds, and red-flags as **config**, not hardcoded — they will be tuned against real results.
- Frame the output as an **"opportunity score", not a promise of profit**; add the resale-cost model (Option 3) once we have data on how flagged cars actually sell.

**Configuration (user-controlled, not hardcoded):** niche (SearchProfile), threshold %,
dealer policy (`label`/`exclude`/`ignore`), and currency (switchable + FX-normalized) are all
config the user tunes per profile. See [[goals]]. This removes the need to commit to a niche
before v1.

## Sources

- docs-developers.ria.com — average price (classic + AI-by-periods)
- github.com/ria-com/auto-ria-rest-api — fields incl. VIN-report link

## Related

- [[00-INDEX]] · [[monitoring-approaches]] · [[glossary]] · [[decisions/README]]
