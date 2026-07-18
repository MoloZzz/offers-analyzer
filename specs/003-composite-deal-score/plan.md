# Implementation Plan: Composite Total Deal Score

**Spec**: `spec.md` · **Created**: 2026-07-18 · **Status**: Draft

## Summary

Extend the multiplicative price core (`raw × confidence × penalty`) with bounded, explainable
factor modifiers (liquidity, repair-risk, negotiation, seller-type, positives) and a
segment-aware mileage norm; present everything as a 0–100 total with per-factor reasons.
Foundational phase is behavior-preserving (neutral modifiers), then factors land one by one —
the spec-002 E1 pattern reused.

## Technical Context

- **Score shape (decision):** stay **multiplicative**. `score = priceCore × Π(modifier_i)`,
  each `modifier_i ∈ [lowerBound_i, upperBound_i]` from the ParameterSet, `1.0` when unknown.
  Multiplicative preserves graceful degradation (anything × 0-ish stays 0-ish) — the additive
  0–100 view is **presentation only** (`subScore = f(modifier)` mapping, pure).
- **Price dominance (decision):** cap `Π(uplift modifiers) ≤ upliftCap` (seed ≈ 1.25) and gate
  `isOpportunity` on `priceCore > 0` — modifiers rank, price qualifies.
- **Heuristic tables (decision):** `config/heuristics/*.json` (liquidity-tiers, repair-risk
  patterns, mileage-norms, negotiation-lexicon, positive-lexicon), loaded/validated at boot,
  content-hash recorded on the active ParameterSet (audit which tables scored what). Factor
  bounds/weights/caps live **in** the ParameterSet (ADR-0005 mechanics: candidate → activate →
  revert).
- **Data inputs:** all factors read fields already on `ListingDetail` (make, model, year, body,
  fuel, gearbox, engine, sellerType) + stored `description`. Zero new request types (FR/SC-005).
- **Text factors:** extend the `condition.ts` architecture (pure scanner, uk+ru, negation-aware
  guarded phrases) with two new lexicons — motivation + positives. Anti-gaming: only concrete
  facts fire (e.g. «сервісна книжка»), promotional adjectives never do.
- **Mileage norms:** pure `segmentOf(body, fuel, modelClass) → {annualK range}`; midpoint feeds
  `expectedMileageK`; M2 and B21a consume it. Fallback = current 15k default.
- **Explanation:** `FactorScore[]` added to `ValuationResult`; `formatWhy`/alert formatter render
  total 0–100 + factor lines. Couples with **B23** (persist explanation) — B23 should land with
  or right after Phase F so factor snapshots are persisted from day one.

## Constitution Check

- I SDD: this spec/plan/tasks precede code. ✅
- II Vault: ADR-0006 + sweep done in the same change; glossary/overview updates at implement
  time per phase. ✅
- III Clean/simple: pure functions per factor, one module (`valuation/factors/`), no new deps. ✅
- V Limits: zero extra API budget by design. ✅
- VI Tests: every pure factor unit-tested; SC-001 regression guard; integration test extended
  with liquid/illiquid + Dokker-class cases. ✅

## Data Model

- `ValuationResult` += `factors: FactorScore[]`, `total100: number`.
- `ParameterSet.params` += `{factorBounds: {liquidity, repairRisk, negotiation, seller,
  positives}, upliftCap, heuristicTableHashes}` (seeded neutral → SC-001).
- No new tables. `Opportunity`/`Listing.lastExplanation` (B23) carry the factor snapshot.
- Config: `config/heuristics/*.json` (checked in, versioned by git + content hash).

## Design & Phasing

### Phase F — Foundational: composite skeleton + presentation (blocking)

`valuation/factors/` scaffold: `Factor` interface (pure: `(input, tables, bounds) →
FactorScore`), composition in `computeValuation` (`Π modifiers`, uplift cap, priceCore gate),
neutral seeds in a new ParameterSet version, 0–100 mapping + `formatWhy`/alert rendering.
**Behavior identical to today** (SC-001). Land B23 persistence here if not already done.

### Phase 1 — US1 Liquidity + US2 Repair-risk (the "does this model make money" factors)

Tier table + lookup (model → make → segment fallback); pattern rules (gearbox/engine/fuel/age);
both pure + unit-tested; integration cases: liquid-vs-illiquid ordering, BMW-2005-diesel vs
Corolla. Vault: glossary terms, how-it-works factor list.

### Phase 2 — US3 Seller-motivation & seller-type

Motivation lexicon scanner + seller-type modifier (policy precedence: `exclude` unchanged).
Unit tests incl. negation («без торгу» must not fire uplift).

### Phase 3 — US4 Positive signals (supersedes B24 framing)

Positive lexicon scanner; uplift + `unverified_bargain` dampening reduction; anti-gaming tests;
Dokker-class integration case. Close B24 in backlog as absorbed.

### Phase 4 — US5 Segment mileage norms

`mileage-norms.json` + `segmentOf`; rewire `expectedMileageK` (M2 + B21a); `/why` names the
segment. Retire flat `MILEAGE_ANNUAL_K` as the default-only fallback.

### Rollout / safety

1. Each phase ships behind the ParameterSet: activating the new version turns the factor on;
   `revert` turns it off. Seed bounds conservative (e.g. liquidity ∈ [0.9, 1.1]).
2. After Phase 1 and again after Phase 3: **threshold re-validation** — run `/report` +
   calibration proposals on the new score distribution before trusting old `minDealScore`
   values (score shape changed; ADR-0006 consequence).
3. SC-006 check after full rollout: 30-day realized precision vs pre-003 baseline.

## Complexity / risk tracking

- **Table curation risk** (wrong tiers/patterns) → config-only fixes, content-hash audit,
  outcomes surface mistakes; start conservative bounds.
- **Score-shape drift vs calibration** → calibration operates on the composite score
  unchanged mechanically, but targets re-validated (Rollout §2).
- **Lexicon false positives** → negation-aware + concrete-facts-only rule + unit tests per cue.
- **Uplift stacking** → per-factor clamps + global `upliftCap` + SC-003 permutation test.

## Related

- `spec.md` · `tasks.md` · ADR-0006 · ADR-0005 · spec 002 (calibration mechanics reused)
