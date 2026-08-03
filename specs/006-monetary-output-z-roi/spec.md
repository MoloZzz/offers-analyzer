# Feature Specification: Monetary output `Z`/`ROI` and assessment confidence

**Feature Branch**: `006-monetary-output-z-roi`

**Created**: 2026-08-03

**Status**: Draft

**Input**: Operator proposal 2026-08-03 — "estimate expected profit adjusted by risk" with a
price/profit breakdown, liquidity, reliability, weighted red flags, repair-cost estimate, a final
investment score, and a **Confidence Score** ("не лише оцінювати авто, а й впевненість у власній
оцінці"). Reviewed in `knowledge-offers-analyzer/context/log/2026-08-03-scoring-proposal-review.md`
and ratified as [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md).

## Context & Problem

Two separate problems, deliberately specified together because they share a presentation surface.

**1. The non-price factors are in the wrong dimension.** Liquidity and repair risk are genuinely
*monetary* quantities expressed today as dimensionless multipliers. A ±10% liquidity multiplier on
$2,000 of expected profit spans ±$200, but the real holding-cost gap between a 25-day and a 120-day
liquidity tier is ~$650 on a $10k car and ~$1,950 on a $30k car — and does not scale with price at
all. `DSG → ×0.85` is really `p(failure) × cost ≈ 0.22 × $1,500 ≈ $330`: a number an operator can
check against reality. `×0.85` is not. Because these are checkable, they can also be validated
against SPEC-007 realized margins, which a multiplier cannot.

**2. The system has no measure of its own evidence.** `confidence` today is
`min(1, sampleSize / (minSamples × 2))` — cohort count only — and it multiplies into the score. Two
listings can score identically while one has a checked VIN, full drivetrain fields and a specific
description, and the other has none of them. The operator has no way to tell which car to drive to
see first.

**What already exists and is NOT rebuilt here** (extend, don't duplicate): the price core and
`fair_value` (spec 001, ADR-0014), the liquidity tier and repair-risk pattern tables (spec 003
US1/US2, coded in `valuation/factors/`), soft/hard red-flags (`red-flags.ts`), the persisted
evaluation explanation (B23), `DealOutcome` and realized margin (spec 007), and the versioned
`ParameterSet` (ADR-0005).

## Guiding constraints (non-negotiable)

- **`Z` does not replace the score.** The 0–100 Total Deal Score keeps its gating and ranking role.
  `Z`/`ROI` are computed and displayed **in parallel**; any future gate switch is a separate
  operator-approved decision after a parallel-run comparison (US6.5).
- **Assessment confidence is an output, never an input.** It MUST NOT be multiplied into `score`,
  `priceCore`, or any factor modifier ([ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) §1).
- **Zero API budget.** Every input is already fetched or already stored. No new request type.
- **Expected values, not invoices.** Costs are `p × cost` with a stated σ. Selling time is a
  liquidity-tier bucket, never a single-day figure.
- **Hard disqualifiers stay boolean.** Salvage, seized, and under-lien remain clamps, not costs.
- **Tunable, not hardcoded.** Cost tables, `torg` ladder, and `DOM_expected` per tier live in the
  versioned `ParameterSet` / versioned config.

## User Scenarios & Testing *(mandatory)*

### User Story 6.1 — Assessment confidence (Priority: P1, ungated)

Every evaluated listing carries a 0–100% **assessment confidence** with signed reasons, rendered in
the alert and in `/why` beside the score. It is computed only from zero-cost fields:
`risk.vinChecked`, `hasVinReport`, cohort `sampleSize` and resolved tier, presence of
`gearbox` / `engine` / `body` / `fuel` / `generation`, description presence and specificity, and
mileage plausibility against the segment expectation. Unknown inputs lower confidence; they never
raise it, and they never change the score.

**Why this priority**: it is the only slice in this spec that changes no score, threshold,
`ParameterSet`, factor modifier, or alert set, so it sits outside the ADR-0011 gates and can ship
before correction `k` lands. It also answers a question the score cannot: two listings at 8.7 and
8.9 are near-indistinguishable, but 94% versus 41% confidence tells the operator which to drive to.

**Independent Test**: two listings with identical score inputs, one with `vinChecked = true` +
complete drivetrain fields + a specific description and one with none, render materially different
confidence percentages and different reason lists — while both render **byte-identical** `score`,
`priceCore`, `total100`, and `isOpportunity`.

**Acceptance Scenarios**:

1. **Given** any listing, **When** it is evaluated, **Then** `score`, `priceCore`, `total100`,
   `isOpportunity`, and the set of alerts fired are bit-for-bit identical to pre-006 behaviour.
2. **Given** a listing with `vinChecked = false`, a thin cohort, and no gearbox/engine/body/fuel,
   **Then** confidence is low and every deduction is listed as a `⚠` reason naming its input.
3. **Given** a listing with a checked VIN, a full-tier cohort, complete fields, and a specific
   description, **Then** confidence is high and every contribution is listed as a `✓` reason.
4. **Given** any listing, **When** the confidence computation is disabled or errors, **Then**
   evaluation still completes and the score is unaffected (the output is strictly additive).

---

### User Story 6.2 — Costs in money: `C_fix`, `C_rec`, `C_hold` (Priority: P1)

The dimensionless liquidity and repair-risk modifiers are re-expressed as dollar quantities:

- `C_fix` — paperwork, inspection, and transfer fees; a `ParameterSet` constant.
- `C_rec = Σ E[cost]` over fired red-flags and matched repair-risk patterns, each entry carrying
  `p(failure)`, `cost`, and `σ`. Starter table: needs-repair description $800, engine/gearbox issue
  $1,500, DSG/CVT ≥150k km $400, air suspension $350, aged turbodiesel $600, aged hybrid battery
  $900, no VIN report $180, post-accident $2,500.
- `C_hold = B × r × DOM_expected / 365`, where `DOM_expected` comes from the spec-003 liquidity
  tier (A=25, B=45, C=70, D=120 days) and `r` is the operator's cost of capital.

**Why this priority**: this is the substance of the re-dimensioning. It consumes the spec-003
tables that already exist in code.

**Independent Test**: the same DSG listing yields `C_rec ≈ $330` with a stated σ rather than a
`×0.85` modifier; a tier-A and a tier-D car at the same price show a `C_hold` gap that scales with
price, unlike the multiplier it replaces.

**Acceptance Scenarios**:

1. **Given** a listing matching ≥1 repair-risk pattern, **Then** `C_rec` includes one line per
   matched pattern with `p`, `cost`, and `σ`, and `/why` renders each line.
2. **Given** a listing whose liquidity tier is unknown, **Then** `DOM_expected` falls back to the
   configured default and the fallback is named in `/why` — never silently assumed.
3. **Given** a hard disqualifier, **Then** it remains a boolean clamp and is **not** converted into
   a cost.

---

### User Story 6.3 — Buy-side estimate `B` with a negotiation ladder (Priority: P2)

`B = asking × (1 − torg)`, where `torg` derives from observed seller behaviour rather than
description keywords: DOM < 30 → 0.03, 30–90 → 0.05, > 90 → 0.08, plus 0.02 per recorded price cut,
capped by `ParameterSet`. Behavioural signals are preferred because a seller can type «терміново»
at will but cannot fake a 90-day listing age or a recorded markdown.

**Why this priority**: it needs SPEC-005's DOM signal to be trustworthy, which is itself paused.

**Independent Test**: two identical listings differing only in DOM and recorded cuts produce
different `B`, and `/why` names which ladder step and how many cuts applied.

**Acceptance Scenarios**:

1. **Given** a listing with DOM 120 and two recorded cuts, **Then** `torg` is the >90 step plus two
   cut increments, clamped to the configured maximum.
2. **Given** a listing first seen today with no price history, **Then** the minimum ladder step
   applies and `/why` says the estimate is behaviourally unsupported.

---

### User Story 6.4 — `Z` and `ROI` composed and displayed (Priority: P1, gated)

`X = RIA_average × k × (1 + drift_mo × 1.5)`, `Z = X × 0.92 − B − C_fix − C_rec − C_hold`,
`ROI = Z / (B + C_fix + C_rec)`. The alert shows `Z` in dollars and `ROI` as a percentage; `/why`
breaks `Z` into its components. The 0–100 score and the alert gate are unchanged.

**Why this priority**: it is the headline output, but it cannot be trusted before `k` exists —
SPEC-004 hypothesizes `fair_value` is inflated 8–15%, which on a $10k car is $800–$1,200, larger
than a typical claimed `Z`.

**Independent Test**: with `k = 1` and `drift = 0`, `Z` reduces to the un-corrected form and every
component is individually reproducible from the persisted explanation.

**Acceptance Scenarios**:

1. **Given** no validated `k`, **Then** `Z` is computed in shadow and labelled as
   survivorship-uncorrected; it MUST NOT be presented as a profit forecast.
2. **Given** a validated `k` and an approved rollout, **Then** `Z` and `ROI` appear in the alert and
   `/why` renders every term of the decomposition.
3. **Given** any state of `Z`, **Then** `isOpportunity` and the alert set are decided by the score
   alone (no regression).

---

### User Story 6.5 — Parallel-run comparison and adoption verdict (Priority: P3)

After ≥1 month of parallel operation, `/report` compares which of `score` and `Z`/`ROI` correlates
better with SPEC-007 realized margin on closed deals. The verdict is recorded as input to a possible
gate switch; it does not perform one.

**Independent Test**: `/report` emits both correlations over the closed-deal set with the sample
size stated, and refuses to emit a verdict below the configured minimum sample.

**Acceptance Scenarios**:

1. **Given** fewer closed deals than the configured minimum, **Then** the report states
   insufficient evidence rather than a correlation.
2. **Given** sufficient closed deals, **Then** both correlations, the sample size, and an explicit
   "no automatic change" statement are shown.

### Edge Cases

- Assessment confidence inputs entirely absent → the floor value, with every missing input named;
  never a fabricated mid-range percentage.
- `C_rec` computed for a listing that is also hard-disqualified → the clamp wins; `Z` is suppressed
  rather than shown as a negative profit, so a trap never appears as a merely-bad deal.
- `DOM_expected` unknown **and** liquidity tier unknown → `C_hold` is reported as a range, not a
  point estimate.
- `Z > 0` while `score` is below threshold → no alert; the score remains the gate (US6.4 AS-3).
- Cost tables will contain errors → they are versioned config with an audit trail; a correction is a
  config change, not a code change.
- `ROI` denominator near zero → suppressed, not rendered as an extreme percentage.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compute an assessment confidence percentage from zero-cost fields
  only, and MUST persist it in the evaluation explanation alongside its reason list.
- **FR-002**: Assessment confidence MUST NOT be multiplied into, added to, or otherwise alter
  `score`, `priceCore`, `total100`, any factor modifier, `isOpportunity`, or the alert set.
- **FR-003**: The system MUST reproduce pre-006 scores and the pre-006 alert set bit-for-bit
  (regression guard), in every slice of this spec.
- **FR-004**: `C_rec` MUST be expressed as Σ `p(failure) × cost` with a per-entry σ, and MUST NOT be
  rendered as a parts/paint/labour line-item breakdown.
- **FR-005**: Expected selling time MUST be rendered as a liquidity-tier bucket or a range, never as
  a single-day point estimate.
- **FR-006**: Hard disqualifiers MUST remain boolean clamps and MUST NOT be converted into costs.
- **FR-007**: Cost tables, the `torg` ladder, `DOM_expected` per tier, `r`, and confidence input
  weights MUST live in the versioned `ParameterSet` / versioned config, hot-swappable per ADR-0005,
  and MUST NOT require a new API request type.
- **FR-008**: `Z` MUST be labelled survivorship-uncorrected until a validated `k` is applied, and
  MUST NOT be presented as a profit forecast before then.
- **FR-009**: `/why` MUST render the full `Z` decomposition and the full confidence reason list from
  the persisted explanation, without a source re-fetch.
- **FR-010**: The alert gate MUST remain the Total Deal Score; `Z` and `ROI` are presentational
  until a separate operator-approved decision says otherwise.

### Key Entities

- **AssessmentConfidence** (value object): `{ percent, inputs[{ key, present, contribution }],
  reasons[] }` — persisted with the evaluation explanation (extends B23).
- **CostEstimate** (value object): `{ code, probability, cost, sigma, reason }` — one per fired
  flag or matched pattern; `C_rec` is their sum.
- **MonetaryOutput** (value object): `{ X, B, torg, C_fix, C_rec, C_hold, Z, ROI, kApplied,
  driftApplied }` — persisted so a historical `Z` is reproducible.
- **ParameterSet** (extended): cost tables, `torg` ladder, `DOM_expected` per liquidity tier, `r`,
  confidence input weights.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing valuation, pipeline, and contract tests pass unchanged; `score` and
  the alert set are bit-for-bit identical across every slice.
- **SC-002**: Every evaluated listing renders an assessment confidence with ≥1 reason per deducted
  input; zero unexplained percentages.
- **SC-003**: A pair of listings with equal `total100` and materially different evidence produces a
  confidence gap of ≥30 percentage points.
- **SC-004**: Poll-cycle API request count is unchanged (SC mirrors spec 003 SC-005).
- **SC-005**: `/why` reproduces both the confidence reason list and the `Z` decomposition from
  persisted data alone, with zero source calls.
- **SC-006**: After the parallel run, `/report` states the `score`-vs-`Z` correlation with realized
  margin and the closed-deal sample size behind it.

## Assumptions

- The spec-003 liquidity tier and repair-risk pattern tables are accurate enough to seed
  `DOM_expected` and `C_rec`; outcomes will surface errors for manual correction.
- `/info` reliably carries gearbox, fuel, engine, body, and generation for most listings; absence
  lowers assessment confidence, which is the intended behaviour rather than a defect.
- The operator's cost of capital `r` and `C_fix` are supplied as configuration, not inferred.
- Description "specificity" can be approximated deterministically (length, presence of concrete
  nouns/numbers) without the unbuilt spec-003 US4 positive-cue lexicon.

## Out of scope (v1 of this spec)

- **Description-derived positive cues** in assessment confidence — overlaps unbuilt spec 003 US4 and
  is seller-authored and gameable (ADR-0018 §2).
- **Price-history behaviour** (DOM, cut count) in assessment confidence — couples to the unresolved
  removed-vs-fell-out-of-paging distinction (B25 / E2c-later). It is used in `torg` (US6.3) only.
- **Graded accident severity (level 1/2/3)** — data-blocked; the AUTO.RIA risk bar is boolean and
  carries no damage location, airbag state, or structural detail (ADR-0018 §5).
- **Red flags requiring absent data** — owner count, ownership duration, service records, key count,
  VIN mismatch are not fields the source provides.
- **Switching the alert gate from `score` to `Z`** — requires the US6.5 verdict plus a separate ADR.
- **Monte Carlo over the σ values** — the σ is captured now, consumed later.

## Related

- [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) (authorizing decision) ·
  [ADR-0006](../../knowledge-offers-analyzer/decisions/0006-operator-profit-vision.md) (vision) ·
  [ADR-0010](../../knowledge-offers-analyzer/decisions/0010-defer-factor-activation-until-k.md) ·
  [ADR-0011](../../knowledge-offers-analyzer/decisions/0011-evidence-gated-scoring-rollout.md) (gates) ·
  [ADR-0005](../../knowledge-offers-analyzer/decisions/0005-versioned-parameter-sets.md)
- Depends on: spec 003 (liquidity tier, repair-risk patterns), spec 004 (`k`), spec 007 (realized
  margin), SPEC-008 (drift), B23 (persisted explanation)
- Vault: `profitability-definition`, `profitability-methods-coverage`, `glossary`, `SPEC-006`
