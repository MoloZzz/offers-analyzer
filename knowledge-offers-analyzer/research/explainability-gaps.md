---
title: Research — explainability gaps (arguing WHY an evaluation was made)
type: research
status: Proposed
updated: 2026-07-17
---

# Explainability — what's missing to argue any evaluation

> Goal: the system must be able to **argue why** it scored a listing the way it did — including a *past*
> decision — reproducibly, cheaply, and even if the listing later changes or disappears. Related:
> [[profitability-definition]], [[how-it-works]], B22 (`/why`).

## What we already have

`/why <url>` (B22) explains a listing on demand: cohort mileage-awareness + **sample size**, the mileage
correction amount, the score decomposition (`raw × confidence × penalty = score`), fired flags grouped by
source, and a verdict. Good for a live, ad-hoc check.

## The gaps (why the current `/why` isn't enough to *argue*)

1. **The explanation is recomputed live, not stored.** `/why` re-fetches the listing and re-runs the
   valuation. So it argues **today's** reasoning, not the reasoning **at the moment of the alert**. The
   market average, the asking price, and the description can all have changed since. For a past
   opportunity we cannot faithfully say *why it was flagged then*. It also spends API budget, and fails
   entirely if the listing is gone.
2. **The stored `Opportunity` is missing the key inputs.** It keeps `score`, `discountPct`, `confidence`,
   `redFlags`, `fairValue`, `askingValue` — but **not** the cohort used + **sample size**, the benchmark
   base (pre-mileage), the mileage adjustment amount, or the `raw`/`penalty` breakdown. So even
   reconstructing from the DB is incomplete.
3. **No parameter/threshold provenance.** Calibration changes thresholds and weights over time, but we
   don't stamp *which* `ParameterSet` version + threshold were in force at evaluation time. So "why was
   this an opportunity in June but not July?" can't be answered.
4. **Condition flags don't record the matched phrase.** We store that `desc_needs_repair` fired, but not
   *which* words in the description triggered it — so we can't quote the evidence.
5. **The `reason` string is English and terse** — not a business-facing argument.

Net: we can explain a *live* listing loosely, but we cannot reliably **reproduce and defend a specific
past decision**, which is exactly what "argue why" needs (and what auto-calibration trust depends on).

## Proposed — a persisted "evaluation explanation"

Snapshot the reasoning **at scoring time** so it can be replayed verbatim, with no re-fetch.

- **X1 — Store a compact explanation on the listing (and opportunity).** Every evaluation already updates
  `Listing.lastScore`/`lastDiscountPct`; add `lastExplanation` (jsonb) written in the same place. Also
  copy it onto the `Opportunity` when one is created. Fields: `cohort {key, tier, sampleSize,
  mileageAware}`, `fairValueBase`, `fairValueAdjusted`, `mileageAdjustment`, `discountPct`, `raw`,
  `confidence`, `penalty`, `score`, `firedFlags [{code, source}]`, `parameterSetVersion`, `thresholdUsed`,
  `evaluatedAt`. (Storing on the listing — not only opportunities — also lets us argue why something was
  **not** flagged, i.e. near-misses; that serves "don't lose good deals".)
- **X2 — Read the stored explanation in `/why` and the alert.** `/why` first tries the stored snapshot
  (faithful, free, works even if the listing is gone); only falls back to a live re-fetch if none exists.
- **X3 — Capture matched condition phrases.** `assessCondition` returns the phrases it matched; include
  them in the explanation and `/why` ("бо в описі: «потребує ремонту»").
- **X4 — Localize + enrich the reason** to a plain-language Ukrainian argument that cites the actual
  numbers and the parameter version.

**Why this is the right shape:** it makes explanations **reproducible** (snapshot, not recompute),
**cheap** (no API budget for `/why`), **durable** (survives listing changes/removal), and **auditable**
(ties each score to the exact cohort, sample, flags, and parameter version). It also strengthens
calibration trust — you can see the inputs behind any tuning decision.

**Cost / trade-offs:** one jsonb column per listing (small); the resolveBenchmark path must surface the
cohort descriptor (tier + key + sampleSize) up to where the opportunity is built — a modest plumbing
change, no new external calls. `resolveBenchmark` already returns `mileageAware`; extend it to return the
matched cohort so the trace is complete.

## Recommendation

Do **X1 + X2** first (persist + read the snapshot) — that alone closes the core gap ("argue a past
decision faithfully, for free"). Then **X3** (phrases) and **X4** (localized argument) as polish. Tracked
as **B23** in [[backlog]].

## Related
- [[profitability-definition]] · [[how-it-works]] · [[overview]] · [[backlog]]
