---
title: Research — "profitability" methods coverage (what we chose, what's built, do we need ML)
type: research
status: Living
updated: 2026-07-18
---

# Defining "profitability": methods considered, coverage, and the ML question

> Companion to [[profitability-definition]]. That note is the **canonical definition + formula**;
> this note is the **survey**: every scoring approach we considered, why each does or doesn't fit
> *our* constraints, what is implemented today, what's planned, and a reasoned verdict on whether
> we should adopt machine learning. Written to be **self-contained** — it can be pasted into a
> stronger model to sanity-check whether our evaluations are sound.

## 0. Our constraints (why "the best method" ≠ "the best method for us")

Any judgement about a scoring method has to be read against four hard constraints. They are the
reason we reject some textbook-optimal approaches.

- **Data budget:** AUTO.RIA official API, free tier ≈ **30 requests/hour**. We are permanently
  data-starved; every scoring input that costs a request is expensive.
- **No sold-price ground truth:** the API exposes **asking** prices and an aggregate
  `interQuartileMean` per cohort — never the price a car *actually sold for*. We do not know true
  resale value.
- **Two business rules that dominate design:** *don't lose a genuinely good deal through a bug*
  and *don't spam the operator*. A method that is more accurate on average but occasionally hides a
  real deal, or floods the operator, is worse for us than a blunter, predictable one.
- **Explainability is a product feature, not a nicety:** the operator must be told **why** a car
  scored as it did (`/why`, and the persisted-explanation work [[explainability-gaps]]). A method
  we cannot explain in one Telegram message is a liability.

## 1. Our definition, in one place

**Reframed by [[0006-operator-profit-vision|ADR-0006]] (2026-07-18):** an **Opportunity** is a
listing with a **high probability of operator profit on resale**, ranked by a composite **Total
Deal Score** = price core (dominant) × liquidity × repair-risk × negotiation × seller ×
positives × confidence (spec `003-composite-deal-score`; factors land incrementally, each
neutral until shipped). The **implemented price core** today: asking price **meaningfully below
the fair market value of comparable cars**, **enough comparable data to trust that**, **no
disqualifying risk** — one signed **deal score ∈ [−1, 1]** (−1 = overpriced/trap, 0 = at
market/unknown, +1 = clearly below market):

```
fairValue   = AUTO.RIA interQuartileMean of the matched cohort   (robust; outliers trimmed)
              corrected for mileage when the cohort isn't mileage-banded (analytic %, capped ±20%)
discountPct = (fairValue − asking) / fairValue × 100
raw         = clamp(discountPct / SCALE, −1, 1)                  # SCALE≈30 → a 30% discount ≈ 1.0
confidence  = min(1, sampleSize / (minSamples × 2))             # thin cohort → score shrinks to 0
penalty     = product of soft-flag penalties (≈0.8 each)         # e.g. no VIN, needs-repair text
score       = raw × confidence × penalty
if a hard red-flag fires (damaged / salvage / customs / etc.): score = min(score, 0)
Opportunity ⇔ score ≥ profile.minDealScore AND sampleSize ≥ minSamples AND not disqualified
```

Full derivation, threshold history and cohort widen-and-retry: [[profitability-definition]].
The tunables (`SCALE`, penalties, mileage factors, threshold) are not constants — they live in a
versioned `ParameterSet` and a per-profile threshold that the system auto-calibrates
([[0005-versioned-parameter-sets|ADR-0005]], spec 002).

## 2. Approaches considered

The list below is the full menu (the eight approaches a general model proposes, plus the composite).
"Fit" is judged against §0.

| # | Approach | Why it's good | Why it's a poor/partial fit for us | Status |
|---|---|---|---|---|
| 1 | **Compare to market price** — `(market − asking)/market` | Cheap, first-party benchmark, fully explainable; directly the thing we care about | Aggregate can be dragged by stale/overpriced or cheap-damaged cars → we use the **robust IQM**, not the plain mean | ✅ **Core, implemented** |
| 2 | **Nearest-analogues cohort** (percentile-rank within closest peers) | Fairer than a market-wide average; captures trim/mileage locally | We match a tight cohort but score against its **central value (IQM)**, not the listing's **percentile rank**. Percentile would need many raw peer prices per query = budget we don't have | ⚠️ **Partial** (cohort yes, percentile no) |
| 3 | **ML expected-price model** (CatBoost/XGBoost/RF) | Learns non-linear feature interactions; could estimate fair value *without* a live request | No sold-price labels → it would learn to predict **asking** prices (the very bias we avoid); data-starved; black-box vs our explainability rule | ❌ **Not implemented — see §5** |
| 4 | **0–100 additive index** (points for low mileage, one owner, service history, minus for stale/too-cheap) | Intuitive; blends many signals; easy to tune | We use a **multiplicative** [−1,1] score instead (price × confidence × penalty) — degrades gracefully to 0 under uncertainty, which an additive index doesn't. Several of its bonus signals (one owner, service book, fresh photos) we don't extract yet | ⚠️ **Different shape; some signals missing** |
| 5 | **Time-on-market** (DaysOnMarket / price-drop count) | Strong liquidity signal — good cars sell fast; a long-stale ad hints at hidden problems or overpricing | We record price history and react to drops, but **do not use age/drop-count as a scoring factor**. AUTO.RIA doesn't cleanly expose "removed vs fell out of paging" (E2c-later) | ⚠️ **Data captured, not scored** → planned **B25** |
| 6 | **Price-history trend** (repeated markdowns) | Signals a motivated seller / negotiability | `PriceObservation` stores the series and drops trigger re-eval, but the **trend isn't a score input** | ⚠️ **Partial** → folded into **B25** |
| 7 | **Description NLP / keywords** | Cheap, deterministic, catches condition traps and quality cues | We scan for **negatives only** (after-accident, non-runner, needs-repair, mechanical) — negation-aware. **Positive** cues and **motivation** cues («торг», «терміново») are **not yet** extracted. Per ADR-0006 §4 positives may now apply a **bounded uplift** (supersedes the old "never lift" rule); anti-gaming stays | ⚠️ **Negatives only** → spec 003 US3/US4 (absorbs B24) |
| 8 | **Computer vision on photos** (rust, damage, paint, interior wear) | Materially improves condition accuracy | Heavy to build/run; photos cost requests; opaque | ❌ **Not implemented** (long-horizon) |
| — | **Weighted composite** of all of the above | Best ceiling accuracy | Our score *is* a composite (price × confidence × penalty), but weights are learned **only** for the soft-flag penalty (spec 002 E4), not a full multi-factor weighted sum | ⚠️ **Partial** |

Two safeguards we run that the generic list omits, both serving §0's business rules:

- **Confidence gate on cohort size** — a below-market price backed by a thin cohort is automatically
  pulled toward 0 and can't alert. Directly *don't-spam*.
- **Hard disqualifiers clamp the score ≤ 0** — a damaged/salvage/customs "bargain" is never a deal
  no matter how deep the discount. Directly *a cheap trap is not a deal*.

## 3. What is implemented today (code-level)

- **Fair value:** AUTO.RIA `interQuartileMean` of a cohort resolved by `valuation/cohort.ts`
  (`resolveBenchmark`, widen-and-retry: make+model+year±1+mileage±25k → year±1 → make+model, until
  `sampleSize ≥ 10`; city never used).
- **Mileage correction:** `valuation/mileage.ts` (`MileageAdjuster`) — when the cohort isn't
  mileage-banded, shifts fair value by `(expected − actual)/10 × per10kPct` %, capped ±20%
  (`expected = age × 15k`).
- **Score:** `valuation/valuation.service.ts::computeValuation` — `raw × confidence × penalty`, hard
  flags clamp ≤ 0, `ParameterSet`-driven tunables.
- **Condition (negatives) from text:** `valuation/condition.ts` — uk+ru, negation-aware; feeds
  `red-flags.ts` (`desc_after_accident`/`desc_not_running` disqualifying; `desc_needs_repair`/
  `desc_mechanical_issue` soft).
- **Odometer-fraud heuristics:** `valuation/mileage-risk.ts` — `suspicious_low_mileage`,
  `unverified_bargain` (soft dampeners; the real VIN mileage is out of reach — [[vin-real-mileage]]).
- **Price history / drops:** `PriceObservation` + poll re-observe; a drop re-evaluates and records a
  passive `price_dropped` outcome. **Not** a score input.
- **Relist de-dup:** [[when-to-alert]] — a known car (by VIN) re-alerts only when cheaper than the
  lowest we ever alerted.
- **Feedback loop:** 👍/👎 + `/outcome` + passive signals → threshold auto-calibration and soft-flag
  weight learning (spec 002).

## 4. Plans, ordered by return-on-effort (re-cut 2026-07-18 per ADR-0006 → spec 003)

1. **Spec 003 — composite Total Deal Score** (Must-Have): liquidity score, model-level
   repair-risk score, negotiation/motivation signals, seller-type modifier, **positive
   description signals with a bounded uplift** (absorbs B24; per ADR-0006 §4 positives may now
   modestly *raise* the score — supersedes the earlier "rank/annotate only, never inflate"
   framing; the price anchor and anti-gaming stay), and **segment-based mileage norms**
   (replaces flat `age × 15k`). All from already-fetched data — zero extra requests.
   (Directly addresses the Dokker miss in §5.)
2. **B25 — time-on-market & price-history as a factor** (Should-Have) — turn the data we
   already store (days seen, number/size of markdowns) into a bounded score modifier and an
   alert annotation. Needs the "removed vs fell-out-of-paging" distinction (couples with
   E2c-later). **Market-demand score** (distinct from liquidity: how fast the segment turns
   over) joins here once snapshot history accumulates.
3. **Better cohorts before fancier models** — the recurring failure mode is a **thin cohort** on
   niche/old cars, not a weak formula. Widening strategy tuning + our own stored percentiles (B11,
   mostly obviated but revisit for regional/trim cuts) beats ML on ROI.
4. **Photos / CV (B-later)** and **full multi-factor weight learning** — long-horizon, only after
   the above and after we have outcome volume.

## 5. Do we actually need ML? — verdict: **not yet, and not for the reason it looks like**

**Short answer:** No. ML is premature and, for our current data, would most likely be *worse* than
the robust-statistics baseline while breaking explainability. The gaps the two example cars expose
are **not** "our price model is too simple" — they're **missing cheap signals** and **thin cohorts**,
neither of which ML fixes.

### The two example listings, analysed

**Renault Dokker 2019, diesel, ~340k km (highway), $5000 — private. Rich description:** official,
full dealer service history + service book, factory-fit GBO BRC, recently replaced front
discs/pads, two keys, ready for any STO inspection, negotiable.

- What makes it interesting is **condition/history offsetting very high mileage** — a human reads
  "340k but highway + full service book + well-kept" and upgrades their estimate.
- **What our pipeline does today:** the mileage correction pushes fair value *down* hard (expected
  ≈ 7yr × 15k ≈ 105k; actual 340k → capped −20%), so $5000 may show only a **small** discount vs the
  corrected fair value → likely **no alert**. And we extract **none** of the positive text signals
  that justify paying more than the mileage implies. **We would probably miss this one.**
- **Would ML catch it?** Only if trained on data encoding "full-service-history high-mileage diesels
  hold value" — i.e. it needs the *positive description features* and *outcome labels* we don't have.
  The **cheaper, explainable fix is B24** (read the positive cues), not a black-box price model.

**Toyota Camry 2002, 215k km, $3650 — private. Thin description:** "official, daily runner,
price-quality."

- Interesting purely as a **cheap, reliable old Toyota** — this is a **price-driven** call.
- **What our pipeline does today:** if the 2002-Camry cohort has `sampleSize ≥ minSamples` and $3650
  is below its IQM, we **catch it on price alone** — the thin description doesn't hurt (positives
  don't yet inflate — bounded uplift comes with spec 003 US4; no negatives present). The **real
  risk is cohort thinness** on a 24-year-old model:
  if AUTO.RIA returns too few comparables, the confidence gate rejects it.
- **Would ML help?** No — the blocker is **too little data**, and ML needs *more* data, not less.
  The fix is **cohort/confidence tuning**, not a model.

### Why ML is a poor fit right now (general case)

- **No ground truth.** ML for "expected price" needs realised transaction prices. We only have
  **asking** prices + an aggregate IQM. A model trained on asking prices learns to reproduce asking
  prices — including the overpriced stale ones — which is exactly the anchor bias we deliberately
  sidestep by using the trimmed IQM. Without sold prices, ML has **no better signal than what we
  already get for free** per query.
- **Data starvation.** At ~30 req/hr we cannot assemble a large, feature-rich, freshly-labelled
  training set in reasonable time.
- **Strong free baseline.** AUTO.RIA's `interQuartileMean` is effectively a robust market model
  computed over their *entire* inventory and handed to us per query. An in-house model would strain
  to beat it with far less data.
- **Explainability.** A gradient-boosted number is hard to defend to the operator in one message;
  it fights our `/why` and persisted-explanation direction ([[explainability-gaps]]).
- **Risk profile.** A black box that occasionally hides a real deal or fires spuriously violates
  *don't lose deals / don't spam* — and is much harder to debug than a transparent formula.

### When ML *would* earn its place (the steelman + trigger conditions)

ML becomes worth revisiting once **all** of these hold — track them, don't guess:

1. **Outcome labels at volume** — enough 👍/👎 and, ideally, bought/sold/resale-price data to train
   against *realised* value rather than asking price.
2. **A feature-rich stored dataset** — engine, drivetrain, trim, options, region, owners, plus the
   B24/B25 signals — accumulated from our own history.
3. **Evidence the baseline is losing** — a measured gap where the rule-based scorer demonstrably
   misses deals a model would catch (e.g. non-linear year×mileage×engine interactions, or chronically
   thin niche cohorts).

At that point the highest-value ML target is **not** replacing the price anchor but **learning the
fair-value surface to estimate FV without spending a request** (a budget win) and **calibrating a
single "probability this is a good deal" from many weak signals** (price, text, days-on-market,
photos). Until conditions 1–3 are met, deterministic wins (B24, B25, cohort tuning) dominate on ROI
and preserve explainability.

## 6. How to sanity-check our scores with a stronger model

To validate whether our evaluations are effective, hand a stronger model: (a) §1's formula and the
active `ParameterSet` values; (b) a sample of scored listings with their inputs (asking, cohort IQM,
`sampleSize`, mileage vs expected, fired flags) and the resulting `score`/`isOpportunity`; (c) the
operator's 👍/👎 labels where available. Ask it to (1) recompute a handful by hand and confirm they
match, (2) flag listings where a human would disagree with the score and name the missing signal,
and (3) estimate realised precision/recall against the labels. Divergences should map to a known gap
in §2 (usually #5/#7 signals or a thin cohort) — if one doesn't, that's a real finding.

## Related

- [[profitability-definition]] — canonical definition + formula (the source of truth)
- [[why-no-opportunities]] · [[vin-real-mileage]] · [[when-to-alert]] · [[explainability-gaps]]
- [[00-INDEX]] · [[glossary]] · [[decisions/README]]
