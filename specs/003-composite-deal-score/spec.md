# Feature Specification: Composite Total Deal Score (operator-profit ranking)

**Feature Branch**: `003-composite-deal-score`

**Created**: 2026-07-18

**Status**: Draft

**Input**: Operator vision proposal 2026-07-18 (P0–P15): "Deal = висока ймовірність отримання
прибутку оператором при перепродажі, не просто нижче ринку. Score = Price (dominant) ×
Liquidity × Condition × Negotiation × Seller × Repair-Risk × Confidence, пояснюваний
оператору як 0–100 з причинами." Ratified as [ADR-0006](../../knowledge-offers-analyzer/decisions/0006-operator-profit-vision.md).

## Context & Problem

The current score (`raw(discount) × confidence × penalty`) treats *any* sufficiently discounted,
non-risky listing as a deal. Operator practice shows profit depends on more: **liquidity** (a
discounted Jaguar XF may never sell; a fairly-discounted Octavia sells in days), **repair-cost
risk** (DSG/CVT/air-suspension/aged premium diesels eat the margin), **seller motivation**
(«торг», «терміново», private owner vs перекуп), **positive condition evidence** (service
history, one owner — today ignored), and a **mileage norm** that isn't one flat 15k km/yr for
vans and sports cars alike. ADR-0006 reframes the product: rank by **expected operator profit**;
this spec implements the new score.

**What already exists and is NOT rebuilt here** (extend, don't duplicate): condition negatives
(C1–C3), listing-level red-flags, odometer-fraud heuristics (B21a), versioned `ParameterSet`
(ADR-0005), outcome capture + threshold calibration + weight learning (spec 002), `/why`
explanation (B22), relist de-dup (B12).

## Guiding constraints (non-negotiable — ADR-0006 invariants)

- **Price stays dominant.** No combination of non-price factors may turn an at/above-market
  listing into an alert. Total non-price uplift is hard-capped.
- **Graceful degradation.** Unknown factor → neutral modifier (1.0). Thin-data behavior
  (confidence gate) unchanged. Hard disqualifiers still clamp score ≤ 0.
- **Zero API budget.** Every new factor consumes data already fetched (`/info` fields +
  stored description). No new request types.
- **Explainable.** Every factor yields a human-readable reason; the operator sees a 0–100
  total + per-factor breakdown in one Telegram message.
- **Tunable, not hardcoded.** Factor weights/bounds live in the versioned `ParameterSet`;
  heuristic tables are versioned config, swappable without redeploy of logic.
- **Not a market appraiser.** The output answers "чи варто подзвонити власнику зараз?",
  not "скільки коштує ця машина?".

## User Scenarios & Testing *(mandatory)*

### User Story F — Composite score skeleton + 0–100 presentation (Foundational, blocking)

The score becomes `price core (raw × confidence × penalty) × Π(factor modifiers)`, where each
modifier is neutral (1.0) until its factor ships; the alert and `/why` render a **0–100 Total
Deal Score** with per-factor sub-scores and signed reasons (`+ 18% below market`, `− expensive
gearbox`). With all modifiers neutral, behavior is **identical to today** (regression guard,
like spec-002 E1).

**Independent Test**: all existing valuation/pipeline tests pass unchanged with neutral
modifiers; a scored listing renders `TOTAL 87/100` + factor lines in `/why` and the alert.

**Acceptance Scenarios**:

1. **Given** the v-next `ParameterSet` seeded with neutral factor bounds, **When** any listing is
   evaluated, **Then** `score` equals the pre-003 value bit-for-bit and alerts fire identically.
2. **Given** a scored listing, **When** the operator runs `/why`, **Then** they see the 0–100
   total, each factor's sub-score, and at least one reason line per non-neutral factor.

### User Story 1 — Liquidity score (Priority: P1)

Every listing gets a liquidity assessment from make/model/generation/year/body/fuel via a
curated heuristic tier table (very liquid: Camry, Corolla, Octavia…; illiquid: XF, CTS, C6…),
with make-level and segment-level fallbacks. Liquid models get a bounded uplift, illiquid a
bounded dampening; the operator sees `Liquidity: 94/100 — popular model, high demand, easy to
resell`.

**Independent Test**: two listings with identical discount/cohort, one liquid one illiquid →
liquid ranks higher and the delta is visible in `/why`; unknown model → neutral + "liquidity
unknown".

**Acceptance Scenarios**:

1. **Given** identical price/cohort inputs, **When** one is a tier-A model and one tier-D,
   **Then** `totalScore(A) > totalScore(D)` and both modifiers are within the ParameterSet bounds.
2. **Given** a model absent from all tables, **Then** the modifier is exactly 1.0 and the
   explanation says liquidity is unknown (never a fabricated tier).

### User Story 2 — Repair-risk score (Priority: P1)

Model-level expected-repair-cost heuristics (distinct from listing-level red-flags): pattern
rules over make/model/engine/gearbox/fuel/age (DSG, CVT, air suspension, turbo diesel ≥N years,
hybrid battery age, premium W12/V8 flagships…) yield LOW/MEDIUM/HIGH with reasons; reliable
models (Corolla, Camry, CR-V, Mazda 6) get LOW. HIGH applies a bounded dampening; the alert
shows `Expected repair risk: HIGH — DSG gearbox, air suspension`.

**Independent Test**: BMW 2005 diesel automatic → HIGH + dampened; Corolla same discount →
LOW + undampened; missing engine/gearbox data → neutral.

**Acceptance Scenarios**:

1. **Given** a listing matching ≥1 high-cost pattern, **Then** risk = HIGH, the modifier
   dampens within bounds, and each matched pattern appears as a reason.
2. **Given** no matched pattern and a known-reliable model, **Then** risk = LOW and the
   explanation says so (no silent neutrality).

### User Story 3 — Seller-motivation & seller-type (Priority: P2)

(a) **Negotiation signals**: the stored description is scanned (uk+ru, negation-aware, reusing
the condition-parser approach) for motivation cues — «торг», «терміново», «переїзд», «потрібні
гроші», «купив нове авто» — producing a bounded uplift ("motivated seller") + reasons.
(b) **Seller-type modifier**: private owner ⇒ mild uplift, перекуп/автомайданчик ⇒ mild
dampening (asking prices run higher; less room). The existing per-profile dealer *policy*
(`label`/`exclude`/`ignore`) is unchanged — this only shades the score where policy = label/ignore.

**Independent Test**: description with «терміново, торг» → uplift + both cues listed; dealer
listing under policy=label → dampened, and under policy=exclude → still excluded (policy wins).

**Acceptance Scenarios**:

1. **Given** a description with ≥1 motivation cue (not negated), **Then** the negotiation
   modifier uplifts within bounds and cues are listed in `/why`.
2. **Given** seller type = dealer and profile policy = `exclude`, **Then** behavior is identical
   to today (never scored into an alert) — the modifier only applies under `label`/`ignore`.

### User Story 4 — Positive signals raise the score (Priority: P2, supersedes B24 framing)

Positive cues (1 owner, official dealer service, service book/history, 2 keys, major service
done, garage kept, factory LPG, new timing belt/suspension…) are extracted (uk+ru,
negation/anti-gaming-aware) and (a) apply a small bounded uplift, (b) reduce the
`unverified_bargain` dampening, (c) appear as `+` reasons. Per ADR-0006 §4 this **reverses**
the old "positives never inflate" rule — but the price-dominance cap still applies.

**Independent Test**: the Dokker case (high-mileage diesel, rich positive history, $5000) now
scores above its no-positives twin and surfaces; promotional fluff («ідеальний стан супер»)
without concrete facts fires nothing.

**Acceptance Scenarios**:

1. **Given** ≥2 concrete positive cues, **Then** an uplift within bounds + reduced
   unverified-bargain dampening, each cue a `+` reason.
2. **Given** an at-market listing (raw ≤ 0) with maximal positives, **Then** it still cannot
   become an Opportunity (price dominance).

### User Story 5 — Segment-based mileage norms (Priority: P2)

`expectedMileageK` uses a segment norm table (segment inferred from body type + fuel + model
class: commercial 30–50k/yr, diesel sedan 20–35k, city hatch 10–20k, sports 5–10k, default
15k) instead of the flat `age × 15k`. The mileage correction (M2) and `suspicious_low_mileage`
(B21a) both consume the segment-aware expectation. `/why` names the segment and norm used.

**Independent Test**: a 5-year-old commercial van at 180k km is no longer treated as
over-driven (norm ≥ 30k/yr); a 5-year-old sports car at 75k km now is; unknown segment falls
back to the default norm (current behavior).

**Acceptance Scenarios**:

1. **Given** a listing whose segment is inferable, **Then** expected mileage = age × segment
   norm and `/why` shows `сегмент: комерційний, норма 40k/рік`.
2. **Given** segment not inferable, **Then** the default norm applies and behavior matches today.

### Edge Cases

- Conflicting signals (positive cues + needs-repair) → both fire; modifiers compose; no
  special-casing.
- Missing body/fuel/engine/gearbox fields → affected factors neutral, never guessed.
- Multiple motivation cues → one bounded uplift (cap per factor), not stacking past bounds.
- Threshold semantics change with the new score shape → thresholds re-validated at rollout
  (see plan §Rollout); calibration (spec 002) keeps operating on the composite score.
- Tier/pattern tables will contain errors → they are versioned config with an audit trail;
  a table fix is a config change, not a code change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Scoring MUST compose the existing price core with per-factor modifiers
  (liquidity, repair-risk, negotiation, seller-type, positive signals), each clamped to
  ParameterSet-defined bounds, neutral when unknown.
- **FR-002**: Product of all uplifting modifiers MUST be hard-capped (ParameterSet), and a
  listing with price-core ≤ 0 MUST NOT become an Opportunity regardless of modifiers.
- **FR-003**: Heuristic tables (liquidity tiers, repair-risk patterns, mileage norms,
  motivation & positive lexicons) MUST be versioned config, hot-swappable per ADR-0005
  mechanics, and MUST NOT require new API request types.
- **FR-004**: The alert and `/why` MUST render a 0–100 Total Deal Score, per-factor
  sub-scores, and signed reasons; every non-neutral factor MUST be traceable to its rule/cue.
- **FR-005**: All text extraction MUST be uk+ru and negation-aware, reusing the condition
  parser's guarded-phrase approach; promotional phrasing without concrete facts MUST NOT fire.
- **FR-006**: With all modifiers neutral the system MUST reproduce pre-003 scores exactly
  (regression guard).
- **FR-007**: Positive signals MUST also reduce (not eliminate) the `unverified_bargain`
  dampening (B24 intent), and MUST NOT alter hard red-flag behavior.
- **FR-008**: Segment mileage norms MUST feed both the M2 correction and B21a
  `suspicious_low_mileage`.
- **FR-009**: Outcome capture / calibration / weight learning (spec 002) MUST keep working
  against the composite score; factor bounds become candidates for future weight learning.

### Key Entities

- **FactorScore** (value object): `{factor, modifier, subScore0to100, reasons[]}` — persisted
  with the evaluation explanation (couples with B23).
- **HeuristicTable** (config, versioned): liquidity tiers, repair-risk patterns, mileage norms,
  lexicons. Referenced by version from the active ParameterSet.
- **ParameterSet** (extended): per-factor bounds/weights + global uplift cap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With neutral modifiers, 100% of existing valuation/integration tests pass
  unchanged.
- **SC-002**: Same-discount liquid vs illiquid pair orders correctly, and the Dokker-class
  case (rich positives) alerts where its positive-free twin does not.
- **SC-003**: No at/above-market listing alerts in any test permutation of maximal positive
  factors (price dominance).
- **SC-004**: Every alert shows total + ≥3 factor lines; `/why` names the rule/cue for every
  non-neutral factor; zero unexplained modifiers.
- **SC-005**: Poll-cycle API request count is unchanged (factors use already-fetched data).
- **SC-006**: After threshold re-validation, operator-measured precision (`/report`, 30-day)
  does not regress vs pre-003 baseline.

## Assumptions

- `/info` reliably carries body type, fuel, gearbox, engine for most listings (missing →
  neutral factors, acceptable).
- Curated tier/pattern tables (heuristics, not learned) are accurate enough to start; outcomes
  (spec 002) will surface mistakes for manual correction.
- Score-shape change is acceptable to the operator given re-validated thresholds.

## Out of scope (v1 of this spec)

- **Time-on-market & price-history factor** (B25) and **market-demand score** — Should-Have
  follow-ups; demand needs accumulated snapshot history, ToM couples with the
  removed-vs-fell-out-of-paging distinction (E2c-later).
- Generation-granular liquidity (start make/model/segment; generations later).
- Learning factor weights from outcomes (E4-style) — future extension via FR-009.
- ML / CV / photo analysis — deferred per [profitability-methods-coverage](../../knowledge-offers-analyzer/research/profitability-methods-coverage.md) §5 triggers.

## Related

- ADR-0006 (vision) · ADR-0005 (ParameterSets) · spec 001 (pipeline) · spec 002 (learning loop)
- Vault: profitability-definition · profitability-methods-coverage · glossary · backlog (epic)
