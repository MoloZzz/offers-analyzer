# Implementation Plan: Monetary output `Z`/`ROI` and assessment confidence

**Spec**: `spec.md` · **Created**: 2026-08-03 · **Status**: Draft

## Summary

Two additive outputs beside the existing score. First, **assessment confidence** — a 0–100%
measure of how well-evidenced an evaluation is, computed from already-fetched fields, persisted
with the explanation, and never multiplied into anything. Second, the **monetary decomposition**
`Z`/`ROI`, which re-expresses the spec-003 liquidity and repair-risk multipliers as dollars
(`C_hold`, `C_rec`) plus a behavioural buy-side estimate (`B`) and a forward-projected sale
estimate (`X`).

Phase 0 (confidence) is behaviour-preserving and ungated. Every later phase is behaviour-preserving
too — `Z` never gates — but is blocked on a dependency that does not exist yet.

## Technical Context

- **Additivity (decision):** every output in this spec is a *projection* of an evaluation, not an
  input to it. `computeValuation` keeps its current signature and return values; the new fields ride
  alongside. A bug in this spec can make an output wrong or absent; it cannot change which listings
  alert. This is what keeps Phase 0 outside the ADR-0011 gates.
- **Non-multiplication (invariant):** enforced by test, not convention — a dedicated regression test
  asserts `score`, `priceCore`, `total100`, and `isOpportunity` are bit-for-bit identical with
  confidence computation enabled and disabled, across the full fixture corpus.
- **Naming (decision):** the price-core term stays `confidence`; the new one is
  `assessmentConfidence` everywhere — code, persisted schema, `/why`, glossary. No bare
  "confidence" in new surfaces. Conflating the two is the primary maintenance risk ADR-0018 names.
- **Confidence shape (decision):** a weighted sum of present/absent evidence inputs, normalized to
  0–100, with a floor. Additive is correct *here* — unlike the score, this is a coverage measure, so
  missing evidence should degrade it linearly, not collapse it toward zero. Each input contributes a
  `ParameterSet`-configured weight; the reason list is generated from the same table, so a weight
  change cannot desynchronize from its explanation.
- **Cost model (decision):** `CostEstimate[]` — one entry per fired flag or matched repair-risk
  pattern, each `{ code, probability, cost, sigma, reason }`. `C_rec = Σ probability × cost`. The σ
  is stored but unconsumed in v1; it exists so a later Monte Carlo does not require a data
  migration.
- **Cost tables (decision):** `config/heuristics/cost-estimates.json` alongside the spec-003
  heuristic tables, same loader, same content-hash-on-ParameterSet audit mechanism. A table
  correction is a config change.
- **Data inputs:** `risk.vinChecked`, `hasVinReport`, `ResolvedBenchmark.sampleSize`/tier, the
  `ListingDetail` drivetrain fields, stored `description`, `PriceObservation` history, and the
  spec-003 liquidity tier. All already fetched or stored. Zero new request types.
- **Persistence:** extend the evaluation explanation to `schemaVersion: 3` — additive only, same
  pattern as the V2 provider-evidence projection. V1 and V2 records stay readable; `/why` renders
  what a record carries and says so when a field predates the schema.
- **Suppression over falsehood:** `Z` is suppressed (not shown negative) for hard-disqualified
  listings; `ROI` is suppressed near a zero denominator; `C_hold` is a range when the liquidity tier
  is unknown. The system omits rather than invents — the same rule that governs neutral factors.

## Constitution Check

- **I SDD:** spec → plan → tasks precede code. ✅
- **II Vault:** ADR-0018 accepted and the supersession sweep (glossary, invariants, overview,
  roadmap, specs index, backlog, profitability-definition) completed in the same task. ✅
- **III Clean/simple:** pure functions (`assessment-confidence.ts`, `cost-estimates.ts`,
  `monetary-output.ts`) in the existing `valuation` module; no new dependencies. ✅
- **V Limits:** zero extra API budget by design (SC-004). ✅
- **VI Tests:** every pure function unit-tested; SC-001 regression guard is the gating test for
  every phase. ✅
- **Operator test (ADR-0006 §6):** a good перекуп decides visit order by how much they trust what
  they know about the car, and budgets in money, not multipliers. ✅

## Data Model

- `ValuationResult` += `assessmentConfidence: AssessmentConfidence`, `monetary?: MonetaryOutput`.
- `EvaluationExplanationV3 extends EvaluationExplanationBase` += `assessmentConfidence`,
  `monetary?` — additive; V1/V2 remain valid.
- `ParameterSet.params` += `{ confidenceWeights, costTableVersion, torgLadder, domExpectedByTier,
  costOfCapital, cFix }`.
- No new entity, no migration for Phase 0 (the explanation column is already `jsonb`).

## Design & Phasing

### Phase 0 — US6.1 Assessment confidence (ungated, ships now)

Pure `assessment-confidence.ts` over already-available inputs; wire into `computeValuation` as an
additive field; extend explanation to V3; render in the alert and `/why`. Gated by the SC-001
regression test. **No `ParameterSet` activation, no threshold touch, no alert-set change** — this is
what places it outside ADR-0011.

### Phase 1 — US6.2 Costs in money

`cost-estimates.ts` + `config/heuristics/cost-estimates.json`; consume the spec-003 repair-risk
matcher and liquidity tier. Computed and persisted in shadow; rendered in `/why` only. Blocked on
nothing technically, but the numbers are only meaningful once spec-003 factors are activated, so it
lands *with* the ADR-0010 combined rollout rather than before it.

### Phase 2 — US6.3 Buy-side `B`

`torg` ladder over DOM and recorded cuts. Blocked on SPEC-005's DOM signal being trustworthy
(currently paused). Until then `torg` uses the minimum step and `/why` says the estimate is
behaviourally unsupported.

### Phase 3 — US6.4 `Z` and `ROI`

Compose `X`, `B`, and the costs. Blocked on SPEC-004 `k` (and SPEC-008 `drift` for the projection
term). Before `k`, `Z` is computed shadow-only and labelled survivorship-uncorrected — it is not
presented as a profit forecast (FR-008).

### Phase 4 — US6.5 Parallel-run verdict

Extend `/report` with the `score`-vs-`Z` correlation against SPEC-007 realized margin. Refuses a
verdict below the configured minimum closed-deal count.

### Rollout / safety

- Phase 0 ships independently and is revertible by removing a display field.
- Phases 1–3 are shadow-computed and display-only; none of them changes `isOpportunity`.
- Any future proposal to gate on `Z` requires the Phase 4 verdict **and** a new ADR (FR-010).
- Every phase re-runs the SC-001 bit-for-bit regression guard as its exit condition.

## Complexity / risk tracking

| Risk | Mitigation |
|---|---|
| The two confidence concepts get conflated | Distinct names everywhere; invariant recorded in `architecture/invariants.md`; enforced by the non-multiplication regression test |
| Cost table numbers are guesses | Versioned config with audit trail; σ captured from day one; Phase 4 measures them against realized margin |
| `Z` read as a promise of profit | Suppression rules + the survivorship-uncorrected label until `k` lands; score remains the gate |
| Confidence becomes a de-facto gate by operator habit | It is display/ordering only; any promotion to an input requires a new ADR (ADR-0018 consequences) |
| Explanation schema churn | V3 is additive; V1/V2 stay readable, same pattern as the V2 provider projection |

## Related

- `spec.md` · [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) ·
  [ADR-0011](../../knowledge-offers-analyzer/decisions/0011-evidence-gated-scoring-rollout.md) ·
  [ADR-0010](../../knowledge-offers-analyzer/decisions/0010-defer-factor-activation-until-k.md) ·
  [ADR-0005](../../knowledge-offers-analyzer/decisions/0005-versioned-parameter-sets.md)
- Depends on: spec 003 (tiers/patterns), spec 004 (`k`), spec 005 (DOM), spec 007 (realized margin),
  SPEC-008 (drift), B23 (persisted explanation)
