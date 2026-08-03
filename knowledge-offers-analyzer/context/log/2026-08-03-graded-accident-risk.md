---
title: Correction — the accident clamp was closed wrongly; ADR-0018 §5 narrowed
type: context-log
date: 2026-08-03
updated: 2026-08-03
---

# Correction — the accident clamp was closed wrongly; ADR-0018 §5 narrowed

## Trigger

The operator re-raised a point from the earlier scoring proposal: *"I don't want to drop all cars
after accidents (it could be a small one)."* Earlier the same day,
[[0018-assessment-confidence-and-monetary-output|ADR-0018]] §5 had closed graded accident handling
as data-blocked.

## What was wrong

§5 conflated two separable questions and closed both:

1. **Can the system derive structured severity** (damage location, airbag state, frame condition)
   from the free AUTO.RIA API? No — the `autoInfoBar` is boolean. **This part was correct and
   stands.**
2. **Should accident presence clamp the score at all?** That is not a data question. §5 answered it
   by implication, without checking what the code does.

Reading `red-flags.ts` and `condition.ts` established the actual behaviour:

```
{ code: 'damaged',             disqualifying: true }   // AUTO.RIA autoInfoBar
{ code: 'desc_after_accident', disqualifying: true }   // condition.ts lexicon
```

Two **independent** hard kills. The description path is the sharper defect: `AFTER_ACCIDENT_PLAIN`
groups `'після дтп'` / `'после дтп'` with `'тотал'` and `'розбит'`. A seller writing *«після ДТП
замінено бампер»* is treated as a total loss — and killed even when the AUTO.RIA bar is clean.
Honest disclosure of trivial damage is punished as hard as concealed structural damage.

**What caused the position change:** reading the two rule tables. The claim about severity
classification had been validated; what the current handling actually does had not been checked
before closing the question.

## Design chosen

The hard problem is not grading — it is not being gamed. Seller text systematically understates
damage, so the rule is asymmetric: **text may raise severity freely, but may lower it below
`unknown` only with VIN corroboration.** Same shape
[[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] uses for claimed mileage.

Two design points worth preserving:

- **The corroboration rule is a floor, not a weight.** A penalty for uncorroborated minor claims
  could still be out-earned by a deep enough discount, and the gaming payoff scales with the
  discount. A floor cannot be out-earned.
- **`unknown` is the modal outcome and is penalized, not excused.** `damaged = true` with no lexical
  evidence means the system does not know how bad it is — not that it was minor. Wording that reads
  as reassurance is a defect.

A hard floor stays for write-off and structural evidence: salvage, total loss, cut or replaced
pillars and roof, deployed airbags, altered geometry, flood, rollover, «конструктор», «розпил».

## Rollout shape

This changes the alert set, so it falls under [[0011-evidence-gated-scoring-rollout|ADR-0011]] —
unlike specs 016 and 017. The spec is therefore shadow-first: the classifier records its verdict
while the current clamp stays live, and a report quantifies what the clamp is suppressing before
anything changes. The flip is one `ParameterSet` activation, revertible by reactivating the prior
version.

If the report shows suppressed listings were reliably bad deals, **the correct outcome is not to
flip**. That is a designed result, not a failure — it would mean the clamp was empirically earned
rather than a blunt default.

## Artifacts

- [[0020-graded-accident-risk|ADR-0020]] — narrows ADR-0018 §5.
- ADR-0018 §5 amended in place with a narrowing note pointing at ADR-0020.
- `specs/018-graded-accident-risk/` — spec, plan, tasks.

## Supersession sweep

Updated: `business/how-it-works.md` (the Ukrainian «після ДТП» disqualifier example),
`research/profitability-definition.md` (score formula comment and the risk red-flags list),
`domain/glossary.md` (Red-flag row, two new terms, the Opportunity business rule),
`architecture/invariants.md` (narrow hard-disqualifier set + the corroboration-asymmetry invariant),
`Roadmap & Status`, `specs/README`, `decisions/README`, `context/CURRENT.md`.

`context/backlog.md` retains its historical B-item records unchanged, per the legacy-queue
preservation rule.

## Phase 1 implemented (same day, T001–T006)

Foundational classifier only. **Nothing is wired into scoring** — `red-flags.ts`, `condition.ts`,
`valuation.service.ts` and the alert set are untouched, so this pass changes nothing observable.

| File | Role |
|---|---|
| `test/fixtures/accident-corpus.ts` | 55 labelled uk+ru cases — the measurement instrument for SC-002/SC-003, written before the classifier |
| `config/heuristics/accident-severity.json` | versioned lexicon; `AFTER_ACCIDENT_PLAIN` **decomposed**, not deleted |
| `src/modules/valuation/accident-severity.ts` | pure classifier + the corroboration floor |
| `src/modules/valuation/factors/tables.ts` | loads/validates/content-hashes the new table |
| `test/unit/accident-severity.spec.ts` | 14 tests: T003 cases + the T005 anti-gaming properties |

Decisions taken during implementation, worth keeping:

- **The lexicon split is the fix.** `'після дтп'` / `'после дтп'` moved to a `disclosure` list that
  never yields a bucket on its own; `'тотал'`, `'розбит'`, `'аварійн'` and the new structural
  markers moved to `severe`. `condition.ts` keeps its own copy verbatim — the two modules have
  different lifecycles, so the duplication is deliberate.
- **Every marker list is negation-guarded**, mirroring `condition.ts`, so «не бита», «без ДТП» and
  «не аварийная» fire nothing (FR-010).
- **Markers must be stems that cannot hide inside an unrelated word.** «утоплен» yes, «топлен» no —
  it sits inside «отоплення». Same reason «скол» was dropped in favour of «сколи»/«сколы»/«відкол»,
  and «стійк» in favour of «заміна стійок»/«стійки замінені». A substring false positive here is a
  hard disqualifier on an innocent listing.
- **Resolution rank is `cosmetic < moderate < unknown < severe`** — how *conservative* a verdict is,
  not how large its penalty is. `unknown` outranks `moderate` so an unestablished severity is never
  resolved down to a self-reported one; that is also what makes "below `unknown` needs corroboration"
  cover both `cosmetic` and `moderate` claims. Phase 3's penalty magnitudes are a separate
  `ParameterSet` map and need not follow this order (spec US18.3 orders penalties
  cosmetic < unknown < moderate).
- **`reason` is a stable machine code**, not operator copy — phase 4 owns the wording, including the
  FR-004 review that `unknown` must not read as reassurance.
- **The classifier returns `null`** when nothing indicates an accident, so phase 2 persists a verdict
  only when there is one.
- The floor is unweighable *by construction*: the classifier takes no price, discount or penalty
  input at all, so there is nothing for a discount to out-earn. A test asserts that contract shape.

**Carried forward, not done:** T002 asks for the lexicon content-hash to be *recorded on the active
`ParameterSet`*. The hash is computed by the existing `HeuristicTablesService.readJson` path, but
`hashes()` still has no consumer anywhere in the codebase — the liquidity and repair-risk tables are
in the same position. Recording it belongs with phase 2's persistence work, where the evaluation
explanation is written, and should cover all three tables at once rather than only this one.

### Verification (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here)

`typecheck`, `lint`, contract Jest (23), and `nest build` all pass. Full Jest: **322 of 323 pass**.
The one failure — `single-flights concurrent calls…` in `test/unit/valuation-evidence.service.spec.ts`
— is **pre-existing and unrelated**: it exceeds Jest's 5 s timeout and fails identically with the
spec-018 changes reverted (`git stash push -- src/modules/valuation/factors/tables.ts`), and that
spec imports nothing touched here. It is spec-015 work and needs its own task.

Phases 2–5 of `specs/018-graded-accident-risk/tasks.md` remain open.

## Related

- [[0020-graded-accident-risk|ADR-0020]] · [[0018-assessment-confidence-and-monetary-output|ADR-0018]] ·
  [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] · [[0006-operator-profit-vision|ADR-0006]]
- Prior notes: `context/log/2026-08-03-scoring-proposal-review.md`,
  `context/log/2026-08-03-breakdown-and-ai-analysis.md`
