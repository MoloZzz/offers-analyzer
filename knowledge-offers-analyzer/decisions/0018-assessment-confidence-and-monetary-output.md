---
title: ADR-0018 — Assessment confidence as a separate output; monetary output before more factors
type: decision
status: Accepted
updated: 2026-08-03
---

# ADR-0018 — Assessment confidence as a separate output; monetary output before more factors

**Status:** Accepted (operator decision)
**Date:** 2026-08-03

## Context

The operator proposed replacing price-difference scoring with a risk-adjusted expected-profit
model: a price/profit breakdown, mileage analysis, liquidity score, a reliability knowledge base,
weighted red flags, graded accident severity, a repair-cost estimate, a 0–10 flip-attractiveness
score under a fixed weight vector (30% profit / 20% liquidity / 20% reliability / 10% repair
complexity / 10% mileage confidence / 10% red flags), and an assessment **Confidence Score**.

Review against the existing vault (`context/log/2026-08-03-scoring-proposal-review.md`) found that
most of the proposal is already decided or built:

- The reframe from "below market" to "expected operator profit" is
  [[0006-operator-profit-vision|ADR-0006]] (2026-07-18).
- Liquidity and repair-risk are specified in spec 003 US1/US2 and **coded** in
  `valuation/factors/`, intentionally inactive per [[0010-defer-factor-activation-until-k|ADR-0010]].
- Money-denominated profit and per-issue repair cost are [[SPEC-006]] (`Z`, `ROI`, `C_rec`).
- Weighted soft red-flags already accumulate multiplicatively and are learnable (spec 002 E4).
- Mileage expectation and the claimed-odometer guard are
  [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]], spec 003 US5, and CHANGE-003.3.

Three findings were not already covered.

**1. Confidence today measures only cohort size.** `confidence = min(1, sampleSize / (minSamples ×
2))` and it *multiplies into the score*. The 2026-08-02 valuation-research log records this as "the
current count-only confidence cap". The system has no measure of how much evidence stands behind an
individual evaluation — whether the VIN was checked, whether the description is specific, whether
the drivetrain fields arrived. Two listings can score identically while one is far better evidenced.

**2. Non-price factors are expressed in the wrong dimension.** Recorded in `context/backlog.md`
under SPEC-006: a ±10% liquidity multiplier on $2,000 of expected profit spans ±$200, but the real
holding-cost gap between a 25-day and a 120-day liquidity tier is ~$650 on a $10k car and ~$1,950 on
a $30k car, and does not scale with price at all. Likewise `DSG → ×0.85` is really
`p(failure) × cost ≈ 0.22 × $1,500 ≈ $330` — a checkable number that a dimensionless multiplier
hides. The operator's proposal reaches the same conclusion independently.

**3. Parts of the proposal exceed the available data.** `ListingDetail` carries risk *booleans*
(`damaged`, `salvage`, `unclearCustoms`, `confiscated`, `underCredit`, `abroad`, `vinChecked`). It
carries no damage location, airbag state, structural detail, owner count, ownership duration,
service records, or key count. Graded accident severity and several proposed red flags therefore
have no data source short of the VIN-report options in [[vin-real-mileage]].

## Decision

1. **Assessment confidence is a new, separate output — never a score multiplier.** It expresses
   confidence in the *evaluation*, distinct from the existing cohort-sample-size `confidence` that
   multiplies into the price core. It MUST NOT be multiplied into `score`, `priceCore`, or any
   factor modifier. Multiplying it would triple-count the same missing evidence, which is already
   counted by the sample-size gate and by the `unverified_bargain` dampener.

2. **Its inputs are zero-cost fields only.** Assessment confidence is computed exclusively from
   data already fetched or already stored: `risk.vinChecked`, `hasVinReport`, cohort `sampleSize`
   and resolved tier, presence of `gearbox` / `engine` / `body` / `fuel` / `generation`, description
   presence and specificity, and mileage plausibility versus the segment expectation. It MUST NOT
   introduce a new request type.

   Description-derived positive cues (service history, one owner, two keys) and price-history
   behaviour (days-on-market, recorded cuts) are **excluded from v1**. The former overlaps
   unbuilt spec 003 US4 and is seller-authored and gameable; the latter couples to the unresolved
   removed-versus-fell-out-of-paging distinction (B25 / E2c-later).

3. **Assessment confidence is display and ordering only, and is therefore outside the
   [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates.** It changes no score, threshold,
   `ParameterSet`, factor modifier, or alert set. It may be rendered in the alert and in `/why`, and
   may break ties in operator-facing ordering. Because it authorizes no scoring change, it may ship
   before the survivorship correction `k` lands. This is the only part of the proposal with that
   property.

4. **[[SPEC-006]] is promoted ahead of the remaining spec-003 factors.** It moves from position 9 in
   the backlog execution order to the next formal spec. Rationale: SPEC-006 *replaces* the
   dimensionally wrong liquidity and repair-risk multipliers with money, rather than adding more
   multipliers on top of them. Its dependencies are unchanged — `Z` still requires SPEC-004's `k`,
   SPEC-007's closed-deal feedback, and SPEC-008's drift — so promotion reorders specification
   work, not the evidence gates.

5. **Graded accident severity (level 1/2/3) is closed as data-blocked.** It is not rejected on
   merit; the classification cannot be derived from the boolean risk bar, and description text is
   seller-controlled and adversarial. It may be reopened only by a separate decision that
   establishes VIN-report data access ([[vin-real-mileage]] options 2/3) or by SPEC-015 provider
   evidence proving to expose structured condition features. Until then hard disqualifiers keep
   clamping the score to ≤ 0 per ADR-0006.

   > **Narrowed 2026-08-03 by [[0020-graded-accident-risk|ADR-0020]].** This clause conflated two
   > separable questions and closed both. Deriving *structured severity* (damage location, airbag
   > state, frame condition) from the free API remains blocked exactly as written above. But whether
   > accident presence should **clamp the score at all** is not a data question, and the answer here
   > was wrong: `damaged` and `desc_after_accident` are both hard disqualifiers today, so an honest
   > «після ДТП замінено бампер» is killed as hard as a total loss. ADR-0020 replaces the blanket
   > clamp with lexicon-derived grading behind a shadow-measured, operator-approved flip, keeping a
   > hard floor for write-off and structural evidence. Read §5 as scoped to structured severity data
   > only.

6. **The fixed additive weight vector is rejected.** ADR-0006 §3's invariants stand: price remains
   dominant, non-price contributions remain *bounded modifiers*, and an unknown factor contributes
   neutrally. An additive vector placing 70% of the weight on non-price factors would let an
   at-market listing alert, violating the price-dominance invariant. The bounded-multiplicative
   shape is deliberate regularization: with roughly fifteen closed deals there is no evidence base
   to fit six free weights.

7. **Line-item repair estimates are rejected in favour of expected values.** A parts/paint/labour
   breakdown to the dollar is false precision for damage the system cannot observe. SPEC-006's
   `C_rec = Σ E[cost]` per red-flag, each carrying a σ, is the correct shape. The same rule applies
   to selling time: report the liquidity tier's `DOM_expected` bucket (A=25, B=45, C=70, D=120
   days), never a fabricated single-day figure.

## Consequences

**Positive.** The operator gains a decision-relevant signal that answers "which car do I drive to
see first" rather than "which car ranks higher" — two listings with equal scores are no longer
indistinguishable. Because it is display-only, it ships without waiting on `k`, giving the project
a shippable improvement during the evidence-gate period. Promoting SPEC-006 converts the two
factors whose dimensional mismatch is already conceded into checkable dollar quantities, which are
also easier to validate against SPEC-007 outcomes than dimensionless multipliers are.

**Negative / to maintain.** A second confidence concept now exists alongside the score's
sample-size `confidence`; the naming must stay explicit in code, `/why`, and the glossary or the
two will be conflated — the non-multiplication rule in §1 is the invariant that keeps them
separate. The remaining spec-003 factors (negotiation, seller-type, positives, segment mileage)
slip behind SPEC-006. Assessment confidence is itself a heuristic and will need its own review once
outcome volume exists; it must not be silently promoted into a scoring input without a new ADR.

**Risk accepted.** If SPEC-004 falsifies the survivorship hypothesis (`k ≥ 0.97`), SPEC-006's `X`
term simplifies but its structure holds, so the promotion is not wasted.

## Related

- [[decisions/README]] · [[0006-operator-profit-vision|ADR-0006]] ·
  [[0010-defer-factor-activation-until-k|ADR-0010]] ·
  [[0011-evidence-gated-scoring-rollout|ADR-0011]] ·
  [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] ·
  [[0017-shadow-valuation-evidence|ADR-0017]]
- [[SPEC-006]] · spec `006-monetary-output-z-roi`
- [[profitability-definition]] · [[profitability-methods-coverage]] · [[vin-real-mileage]] ·
  [[explainability-gaps]] · [[glossary]]
- Review note: `context/log/2026-08-03-scoring-proposal-review.md`
