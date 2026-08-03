# Implementation Plan: Graded accident risk

**Spec**: `spec.md` · **Created**: 2026-08-03 · **Status**: Draft

## Summary

Split the current all-or-nothing accident handling into a lexicon-derived severity verdict, record
it in shadow while today's clamp stays live, then flip to graded penalties in one operator-approved
`ParameterSet` change. A hard floor stays for write-off and structural evidence.

## Technical Context

- **Classifier placement (decision):** a new pure `valuation/accident-severity.ts` consuming
  `ListingRisk` and the description. It does **not** live inside `condition.ts` — that module answers
  "does the text mention a problem", this one answers "how bad", and merging them would force the
  boolean signals and the graded verdict to share a lifecycle they do not share.
- **Lexicon split (decision):** the existing `AFTER_ACCIDENT_PLAIN` is decomposed, not deleted.
  `'тотал'`, `'розбит'`, `'разбит'`, `'аварійн'`, `'аварийн'` move to the `severe` list along with
  new structural markers (cut/replaced pillars and roof, deployed airbags, altered geometry, flood,
  rollover, «конструктор», «розпил»). `'після дтп'` / `'после дтп'` move to a **disclosure** list
  that signals *an accident happened*, not *how bad* — this is the specific pair causing the defect.
- **Anti-gaming (decision):** severity resolves as `max(barSeverity, textSeverity)` with one
  exception — a text verdict *below* `unknown` is admitted only when `risk.vinChecked ||
  hasVinReport`. Implemented as an explicit floor, not as a scoring weight, so it cannot be tuned
  away by a `ParameterSet` edit. ADR-0014 uses the same asymmetry for claimed mileage; reusing the
  shape means one rule to reason about rather than two.
- **Why a floor and not a penalty:** a penalty for uncorroborated minor claims would still let a
  sufficiently deep discount out-earn it. A floor cannot be out-earned. The distinction matters
  because the gaming payoff scales with the discount.
- **Shadow mechanism (decision):** the verdict is computed and persisted unconditionally; whether it
  *acts* is one `ParameterSet` boolean plus per-bucket penalties. With the boolean off, the existing
  `disqualifying: true` rules are untouched, so shadow mode is byte-identical by construction rather
  than by careful arithmetic.
- **Red-flag engine change:** `RED_FLAG_RULES` gains a rule whose `disqualifying` is resolved from
  the active `ParameterSet` rather than hardcoded. That is the only structural change to
  `red-flags.ts`; the soft-penalty composition and `SOFT_FLAG_CODES` learning surface are untouched.
- **Persistence:** `AccidentSeverity` rides in the evaluation explanation (V3, additive alongside
  spec 006's fields). No new entity, no migration.
- **Reporting:** the rollout report is a read-only query over persisted explanations plus
  `ListingDisappearance` — no new capture, no new requests.

## Constitution Check

- **I SDD:** spec → plan → tasks precede code. ✅
- **II Vault:** ADR-0020 accepted, ADR-0018 §5 narrowed, and the supersession sweep run in the same
  task. ✅
- **III Clean/simple:** one pure module, one lexicon config, one `ParameterSet` field. The existing
  lexicon is decomposed rather than duplicated. ✅
- **V Limits:** zero API budget — classification reads already-fetched data. ✅
- **VI Tests:** classifier unit-tested against a labelled uk+ru corpus; shadow equivalence is a
  bit-for-bit regression guard. ✅
- **Operator test (ADR-0006 §6):** a good перекуп absolutely buys a car with a repainted wing and
  absolutely does not buy one with cut pillars. Encoding that distinction is the whole feature. ✅

## Data Model

- `AccidentSeverity` value object persisted in the evaluation explanation. Additive.
- `ParameterSet.params` += `{ accidentGradingEnabled: boolean, accidentPenaltyByBucket: {cosmetic,
  moderate, unknown} }`. Absent → clamp behaviour, i.e. today.
- `config/heuristics/accident-severity.json` — versioned lexicon, content-hash recorded on the
  active `ParameterSet` like the other heuristic tables.
- No entity change, no migration.

## Design & Phasing

### Phase F — Foundational: classifier + labelled corpus (blocking)

`accident-severity.ts`, the decomposed lexicon config, the corroboration floor, and a labelled
uk+ru description corpus. Tests assert the anti-gaming property directly. No wiring yet.

### Phase 1 — US18.2 Shadow recording + rollout report

Persist the verdict on every evaluation; keep the clamp live. Admin-only report over persisted
explanations: suppressed counts by bucket, would-be scores, subsequent relist/disappearance
outcomes. **Ungated** — behaviour is provably unchanged.

### Phase 2 — US18.3 The flip

`ParameterSet` fields; `red-flags.ts` resolves `disqualifying` for the accident rules from the
active set; per-bucket penalties. Ships **off**. Enabling is one operator-approved activation,
revertible by reactivating the prior version.

### Phase 3 — US18.4 Explanation surfaces

Severity, evidence, corroboration state, and applied penalty in `/why` and the spec-016 breakdown.
The `unknown` wording is reviewed explicitly — it must not read as reassurance.

### Rollout / safety

- Phases F and 1 change nothing observable; SC-001 is the exit condition for both.
- Phase 2 ships disabled. The flip needs the Phase 1 report **and** operator approval (ADR-0011).
- The flip is one `ParameterSet` activation, so revert is an activation of the prior version — no
  code change, no migration.
- `/report` precision is compared over a matched window before and after.
- If the report shows suppressed listings were reliably bad, **the correct outcome is not to flip**.
  That possibility is a designed result, not a failure.

## Complexity / risk tracking

| Risk | Mitigation |
|---|---|
| Sellers game the lexicon to reach `cosmetic` | Corroboration floor — an uncorroborated text claim cannot go below `unknown`; implemented as a floor, not a weight, so a deep discount cannot out-earn it |
| A structural wreck classified as minor | `severe` list is matched first and `max()`-resolved with the bar; SC-002 asserts zero downgrades on the labelled corpus |
| Alert volume floods the operator | Shadow phase quantifies the volume *before* the flip; per-bucket penalties are `ParameterSet`-tunable; revert is one activation |
| `unknown` wording reads as reassurance | Phase 3 reviews the wording explicitly; FR-004 forbids implying minor damage |
| Lexicon errors | Versioned config with audit trail; spec-002 outcomes surface mistakes |
| Interaction with `suspicious_discount > 45%` | Deliberately unchanged and re-validated at rollout; noted in the spec's edge cases |
| The clamp turns out to have been correct | Phase 1 is designed to reveal that before any change is made |

## Related

- `spec.md` · [ADR-0020](../../knowledge-offers-analyzer/decisions/0020-graded-accident-risk.md) ·
  [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md) §5 ·
  [ADR-0014](../../knowledge-offers-analyzer/decisions/0014-conservative-benchmark-and-mileage-guard.md) ·
  [ADR-0011](../../knowledge-offers-analyzer/decisions/0011-evidence-gated-scoring-rollout.md)
- Feeds: spec 006 (`C_rec` consumes the bucket), spec 016 (renders it), spec 017 (ambiguous cases)
