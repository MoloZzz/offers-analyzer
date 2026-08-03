# Tasks: Monetary output `Z`/`ROI` and assessment confidence

**Spec**: `spec.md` · **Plan**: `plan.md` · **Created**: 2026-08-03

## Format: `[ID] [P?] [Story] Description`

`[P]` = parallelizable (different files, no ordering dependency).

## Path Conventions

Single NestJS project. Pure logic in `src/modules/valuation/`, config in `config/heuristics/`,
tests in `test/unit/` and `test/integration/`.

---

## Phase 1: Setup (shared)

- [ ] T001 Add `AssessmentConfidence`, `CostEstimate`, and `MonetaryOutput` value-object types to
      `src/modules/valuation/valuation.types.ts` (or alongside `factor.ts` if that fits the module
      layout better). Types only — no behaviour.
- [ ] T002 Extend `EvaluationExplanation` with an additive `EvaluationExplanationV3` carrying
      `assessmentConfidence` and optional `monetary`, in
      `src/modules/valuation/evaluation-explanation.ts`. V1/V2 must remain readable.
- [ ] T003 [P] Extend `ParameterSet.params` typing with `confidenceWeights`, `costTableVersion`,
      `torgLadder`, `domExpectedByTier`, `costOfCapital`, `cFix`. All optional; absent means the
      corresponding output is omitted, never defaulted to a fabricated value.

---

## Phase 2: Foundational — the non-multiplication guard (BLOCKING)

**This phase must complete before any output is wired in.** It is the safety property the whole
spec rests on.

- [ ] T004 Write the bit-for-bit regression test in `test/unit/valuation-additivity.spec.ts`:
      across the full fixture corpus, assert `score`, `priceCore`, `total100`, `discountPct`,
      `isOpportunity`, and `disqualified` are identical with the new outputs enabled and disabled.
      **This test must exist and pass before T007.**
- [ ] T005 Add an integration assertion in `test/integration/` that the set of listings producing
      an alert is unchanged with the new outputs enabled.

---

## Phase 3: User Story 6.1 — Assessment confidence (P1, ungated) 🎯 MVP

### Tests

- [ ] T006 [P] [US6.1] Unit tests for `assessment-confidence.ts` in
      `test/unit/assessment-confidence.spec.ts`: full-evidence listing → high percent with `✓`
      reasons; zero-evidence listing → floor with a `⚠` reason naming every missing input; the
      ≥30-point gap case (SC-003); every reason traceable to exactly one input.

### Implementation

- [ ] T007 [US6.1] Pure `src/modules/valuation/assessment-confidence.ts` — weighted coverage over
      `risk.vinChecked`, `hasVinReport`, cohort `sampleSize` + resolved tier, presence of
      `gearbox` / `engine` / `body` / `fuel` / `generation`, description presence and specificity,
      and mileage plausibility versus the segment expectation. Normalized 0–100 with a floor.
      Reasons generated from the same weight table, so a weight change cannot desync from its
      explanation. **Returns a value; touches no score.**
- [ ] T008 [US6.1] Seed `confidenceWeights` into the `ParameterSet` params (candidate, not
      activated — no live activation is needed since nothing gates on it).
- [ ] T009 [US6.1] Wire into `computeValuation` as an additive `ValuationResult` field. Wrap in a
      guard so a computation error yields an absent output and never fails the evaluation (spec
      US6.1 AS-4).
- [ ] T010 [US6.1] Persist into the V3 explanation on `Listing.lastExplanation` and
      `Opportunity.explanation`.
- [ ] T011 [P] [US6.1] Render in the alert formatter — one line, percent + top reasons —
      `src/modules/notifications/format/`.
- [ ] T012 [P] [US6.1] Render the full reason list in `/why` from persisted data only, zero source
      calls (SC-005).
- [ ] T013 [US6.1] Re-run T004/T005. Exit condition for the phase.

**Checkpoint:** US6.1 is independently shippable here. Everything below is blocked on a dependency
that does not exist yet.

---

## Phase 4: User Story 6.2 — Costs in money (P1, lands with the ADR-0010 combined rollout)

- [ ] T014 [P] [US6.2] Unit tests for `cost-estimates.ts`: one entry per fired flag/matched
      pattern with `p`, `cost`, `σ`; DSG case ≈ $330; hard disqualifier produces **no** cost entry.
- [ ] T015 [US6.2] `config/heuristics/cost-estimates.json` seeded from the spec-006 starter table
      (needs-repair $800, engine/gearbox $1,500, DSG/CVT ≥150k $400, air suspension $350, aged
      turbodiesel $600, aged hybrid battery $900, no VIN report $180, post-accident $2,500), each
      with `p` and `σ`. Content-hash recorded on the active ParameterSet, same as spec-003 tables.
- [ ] T016 [US6.2] Pure `src/modules/valuation/cost-estimates.ts` — `C_rec = Σ p × cost`; consumes
      the spec-003 repair-risk matcher. Hard disqualifiers excluded by construction (FR-006).
- [ ] T017 [US6.2] `C_hold = B × r × DOM_expected / 365` from the liquidity tier (A=25, B=45,
      C=70, D=120); unknown tier → a range, with the fallback named (US6.2 AS-2).
- [ ] T018 [US6.2] `C_fix` from `ParameterSet`. Render all three in `/why` only.
- [ ] T019 [US6.2] Re-run T004/T005.

---

## Phase 5: User Story 6.3 — Buy-side `B` (P2, blocked on SPEC-005 DOM)

- [ ] T020 [P] [US6.3] Unit tests for the `torg` ladder: DOM<30→0.03, 30–90→0.05, >90→0.08,
      +0.02/cut, clamped; no price history → minimum step + "behaviourally unsupported" reason.
- [ ] T021 [US6.3] Implement the ladder over `PriceObservation` history and DOM. Seed the ladder
      into `ParameterSet`.
- [ ] T022 [US6.3] Re-run T004/T005.

---

## Phase 6: User Story 6.4 — `Z` and `ROI` (P1, blocked on SPEC-004 `k`)

- [ ] T023 [P] [US6.4] Unit tests: with `k=1`, `drift=0`, `Z` reduces to the uncorrected form;
      every component reproducible from the persisted explanation; hard-disqualified listing →
      `Z` suppressed, not negative; near-zero `ROI` denominator → suppressed.
- [ ] T024 [US6.4] `src/modules/valuation/monetary-output.ts` — `X = RIA_average × k ×
      (1 + drift × 1.5)`, `Z = X × 0.92 − B − C_fix − C_rec − C_hold`,
      `ROI = Z / (B + C_fix + C_rec)`.
- [ ] T025 [US6.4] Label `Z` survivorship-uncorrected whenever no validated `k` is applied; block
      any presentation of it as a profit forecast in that state (FR-008).
- [ ] T026 [US6.4] Render `Z`/`ROI` in the alert and the full decomposition in `/why`.
- [ ] T027 [US6.4] Assert `isOpportunity` and the alert set remain score-decided (US6.4 AS-3).
- [ ] T028 [US6.4] Re-run T004/T005.

---

## Phase 7: User Story 6.5 — Parallel-run verdict (P3, blocked on SPEC-007 volume)

- [ ] T029 [P] [US6.5] Unit tests: below the minimum closed-deal count → "insufficient evidence",
      never a correlation; at/above → both correlations plus sample size plus an explicit "no
      automatic change" line.
- [ ] T030 [US6.5] Extend `/report` (`src/modules/query/`) with the `score`-vs-`Z` correlation
      against SPEC-007 realized margin over closed deals.
- [ ] T031 [US6.5] Record the verdict in the vault as input to a possible gate switch. **Does not
      perform one** — that needs a new ADR (FR-010).

---

## Phase 8: Polish & cross-cutting

- [ ] T032 [P] Update `knowledge-offers-analyzer/architecture/overview.md` and
      `domain/glossary.md` for anything that changed during implementation.
- [ ] T033 [P] `npm run vault:build` then `npm run vault:check:strict`.
- [ ] T034 Verification gate: `typecheck`, `lint`, full Jest, contract Jest, Nest build — all via
      RTK (`rtk npm test`), or the native equivalent with the fallback stated in the task record.

---

## Dependencies & Execution Order

### Phase dependencies

- Phase 1 (setup) → Phase 2 (guard) → Phase 3 (US6.1). **Phase 2 blocks everything.**
- Phase 4 (US6.2) requires spec-003 factor activation to be meaningful → lands with the ADR-0010
  combined rollout.
- Phase 5 (US6.3) requires SPEC-005 DOM (currently paused).
- Phase 6 (US6.4) requires SPEC-004 `k`; the projection term additionally wants SPEC-008 `drift`.
- Phase 7 (US6.5) requires SPEC-007 closed-deal volume.

### User story dependencies

US6.1 is fully independent. US6.4 depends on US6.2 and US6.3 for its cost and buy-side terms.
US6.5 depends on US6.4.

### Parallel opportunities

T003, T006, T011, T012, T014, T020, T023, T029, T032, T033 are `[P]` — distinct files.

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US6.1).** That slice is shippable on its own, requires no
`ParameterSet` activation, no threshold change, and no evidence gate. It is the only part of this
spec that can proceed before correction `k` lands.

Everything after it is shadow-computed and display-only. No phase in this spec changes which
listings alert; that property is asserted by T004/T005 at the exit of every phase.

## Notes

- Do not multiply `assessmentConfidence` into anything. T004 exists to catch exactly that.
- Do not render `C_rec` as a parts/paint/labour breakdown (FR-004) or selling time as a single-day
  figure (FR-005).
- Graded accident severity is out of scope and data-blocked — see ADR-0018 §5 before reopening it.
