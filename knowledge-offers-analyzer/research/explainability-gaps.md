---
title: Research — explainability gaps (arguing WHY an evaluation was made)
type: research
status: Implemented
updated: 2026-08-02
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
decision faithfully, for free"). Then **X3** (phrases) and **X4** (localized argument) as polish.
**B23 is now a rollout gate, not deferred polish:** it must land before `k`, factor bounds, or a
new threshold is activated, per [[0011-evidence-gated-scoring-rollout|ADR-0011]].

## Implementation note (2026-07-28)

B23 implemented X1 + X2 as the first persisted-provenance slice:

- `Listing.lastExplanation` stores a compact `EvaluationExplanation` for every poll evaluation,
  including cohort key/tier/sample, fair-value base/adjusted values, mileage adjustment,
  raw/confidence/penalty/score, fired flags, `ParameterSet` version, threshold, and timestamp.
- `Opportunity.explanation` copies the same snapshot when an evaluation crosses the profile
  threshold.
- `/why` first renders the stored snapshot for a known listing and only falls back to live fetch +
  recompute when no snapshot exists.

X3 (matched phrases) and X4 (richer localized business argument) remain follow-up polish; live scoring
behavior was deliberately unchanged.

## Implementation note (2026-08-05) — spec 016 phases 1–2: reach, and one renderer

B23 made a past decision *reproducible*; spec 016 made it *reachable* and stopped the four
formatters that render it from drifting apart.

- **One builder.** `src/modules/notifications/format/breakdown.ts` turns an `EvaluationExplanation`
  into an ordered `Breakdown` of labelled sections (identity, price, cohort, mileage, provider
  evidence, score, factors, flags, confidence, monetary, verdict). It **computes nothing** — every
  emitted parameter is a field of the record it was handed. `formatWhy` and `formatStoredWhy` are
  now one-line adapters over it; `/check` takes its score total and risk line from it.
- **Availability is explicit.** Each line carries `availability: 'available' | 'unavailable'` with a
  reason. A V1/V2 snapshot says the measure *did not exist yet*; a V3 carrying `null` says it *was
  not measured*. Neither is ever rendered as `0` or a bare dash. This is the same discipline the
  SPEC-015 `ValuationFact` shape established.
- **Reach.** Opportunity and price-drop alerts carry a 📋 **Деталі** inline button
  (`details:<listingId>`, 44 of Telegram's 64 callback bytes, no encoded state). The pushed alert
  body is unchanged at seven lines — detail is pulled, never pushed.
- **Zero budget by construction.** `details-callback.ts` has *no imports at all*, so it cannot reach
  a source; the reply resolves through `QueryService.storedBreakdownById`, a pure storage read. A
  source-text test and an integration test with live source/budget mocks assert both.
- **Growth without edits.** `factors`, `assessmentConfidence` and `monetary` sections already exist
  and populate the moment records start carrying them — no renderer change when the ADR-0010
  rollout or SPEC-006's monetary slices land. Today all three render as stated gaps, which is the
  honest picture of an inactive-factor, pre-`k` system.
- **Not rendered:** the spec-018 `accidentSeverity` shadow verdict. It stays behind admin-only
  `/accident_shadow` until phase 3 is approved ([[0020-graded-accident-risk|ADR-0020]]).

Phases 3–4 (the `/check` full-section layout, and the test-only forward-compatibility proof) remain
open. X3 and X4 above are still untouched: the breakdown surfaces the flag *codes*, not the matched
phrases, and the `reason` string is still the terse English one.

## Related
- [[profitability-definition]] · [[how-it-works]] · [[overview]] · [[Roadmap & Status]]
