---
title: ADR-0006 — Vision shift: from "below market" to "probability of operator profit"
type: decision
status: Accepted
updated: 2026-07-18
---

# ADR-0006 — Vision shift: rank by expected operator profit, not just discount

**Status:** Accepted
**Date:** 2026-07-18

## Context

The product goal to date (goals.md, constitution preamble, [[profitability-definition]]) was:
**find cars priced meaningfully below fair market value, with low risk**. The deal score is
`raw(discount) × confidence × penalty`, i.e. price-centric with risk as a dampener.

Operator practice exposed the gap between "below market" and "will actually make the operator
money" ([[profitability-methods-coverage]] §5 — the Dokker and Camry cases):

- A deep discount on an **illiquid** model (Jaguar XF, Citroën C6) can sit unsold for months —
  no profit despite the discount.
- A modest discount on a **highly liquid** model (Camry, Octavia) with a motivated private
  seller («торг», «терміново») is often the better real-world deal.
- **Repair-cost risk** (DSG, CVT, air suspension, aged premium diesels) eats the margin; the
  current red-flags only catch listing-level risks (damage, customs), not model-level ones.
- **Positive condition evidence** (one owner, full service history, garage-kept) is real value
  a buyer pays for, but today positives may only *remove* penalties, never help.
- The flat `age × 15k km/yr` mileage norm misjudges whole segments (commercial vans, city
  hatchbacks, sports cars).

The operator has decided to reframe the product (proposal of 2026-07-18, P0–P15).

## Decision

1. **Vision.** A *deal* is a listing with a **high probability of bringing the operator profit
   on resale** — not merely a price below fair market value. The product is an **operator's
   (перекуп's) assistant that ranks listings by expected profitability**; discount below fair
   value remains the single most important input, but no longer the definition.

2. **Not a market appraiser.** The system answers *"чи варто оператору зараз подзвонити
   власнику?"*, never *"скільки коштує ця машина?"*. Features that only improve abstract price
   estimation without improving call-worthiness are out of scope.

3. **Composite Total Deal Score.** The score becomes a composite of explainable factors —
   **price (dominant) · liquidity · condition · negotiation · seller · repair-risk ·
   confidence** — presented to the operator as a 0–100 total with per-factor sub-scores and
   plain-language reasons. Design invariants (binding on spec 003):
   - **Price stays dominant**: no combination of non-price factors may turn an at/above-market
     listing into an alert.
   - **Graceful degradation**: an unknown factor contributes neutrally (modifier = 1), never
     invents signal; thin-data behavior (confidence gate, freeze) is unchanged.
   - **Hard disqualifiers still clamp the score ≤ 0** (a cheap trap is not a deal).
   - Every factor's weights/bounds live in the **versioned `ParameterSet`**
     ([[0005-versioned-parameter-sets|ADR-0005]]) — tunable, rollbackable, learnable later.
   - Every factor must be explainable in one Telegram message (`/why`).

4. **Positive signals may raise the score (bounded).** This **supersedes the earlier rule**
   "positives never inflate the score" (B24's original framing, condition C2 notes). Positive
   evidence (one owner, service history, two keys, garage-kept, fresh major service, factory
   LPG…) may apply a small, capped uplift — it may never substitute for discount (see
   invariant "price stays dominant") and never weakens anti-gaming: guarded/promotional
   phrasing still doesn't fire.

5. **Segment-based mileage norms** replace the flat `age × 15k` expectation: expected annual
   mileage keyed by segment/body/fuel (commercial 30–50k, diesel sedan 20–35k, city hatch
   10–20k, sports 5–10k …), heuristic tables first.

6. **Operator-thinking test.** Before building any feature, ask: *"чи використовує це хороший
   перекуп при купівлі авто?"* If no — it's probably not moving the operator toward profit.
   Recorded as a workflow gate in the constitution (v1.1.0).

7. **ML stays deferred.** This reframing changes the *target*, not the method verdict —
   [[profitability-methods-coverage]] §5 (no sold-price ground truth, data-starved, strong
   free baseline, explainability) still holds. Heuristics first; ML only on its trigger
   conditions.

## Consequences

- **Easier:** ranking matches how a good перекуп actually thinks; illiquid/expensive-to-fix
  "bargains" stop outranking sellable ones; the alert explains itself factor by factor.
- **Harder / new maintenance:** heuristic tables (liquidity, repair-risk, mileage norms,
  negotiation & positive keyword lists) must be curated and kept in the `ParameterSet` /
  config, uk+ru keyword lists maintained; more factors → more explanation surface (`/why`,
  B23 persisted explanations become more important, not less).
- **Score shape changes** → thresholds (`minDealScore`) and calibration targets must be
  re-validated after spec 003 lands; existing scores are not directly comparable.
- **Supersessions:** the "positives never inflate" rule (B24 framing, C2 notes,
  methods-coverage §2 #7) is narrowed per §4; goals.md vision, constitution preamble
  (1.0.2 → 1.1.0), [[profitability-definition]] framing, [[glossary]] (Opportunity/score
  terms), [[how-it-works]] business narrative — all updated in this task's sweep.
- **Roadmap** is re-cut around this vision — see the revised epic in `context/backlog.md`
  and `specs/003-composite-deal-score/`.

## Related

- [[decisions/README]] · [[profitability-definition]] · [[profitability-methods-coverage]]
- Spec: `../../specs/003-composite-deal-score/spec.md`
