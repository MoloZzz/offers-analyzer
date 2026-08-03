---
title: ADR-0020 — Accident presence is graded risk, not a hard disqualifier
type: decision
status: Accepted
updated: 2026-08-03
summary: Narrows ADR-0018 §5 — severity classification stays data-blocked, but the blanket accident clamp is removed behind a shadow-measured, operator-approved flip.
---

# ADR-0020 — Accident presence is graded risk, not a hard disqualifier

**Status:** Accepted (operator decision)
**Date:** 2026-08-03

**Narrows:** [[0018-assessment-confidence-and-monetary-output|ADR-0018]] §5

## Context

[[0018-assessment-confidence-and-monetary-output|ADR-0018]] §5 closed graded accident handling as
"data-blocked", reasoning that level 1/2/3 severity tiers cannot be derived from AUTO.RIA's boolean
risk bar. That reasoning was correct about *classification* and wrong about *scope*: it conflated
two separable questions and closed both.

Reading `red-flags.ts` and `condition.ts` established what the system actually does today:

```
{ code: 'damaged',             disqualifying: true }   // AUTO.RIA autoInfoBar
{ code: 'desc_after_accident', disqualifying: true }   // description lexicon
```

Two **independent** hard kills, and a disqualifier clamps `score ≤ 0`, so the listing can never
become an Opportunity. The description lexicon is the sharper problem: `AFTER_ACCIDENT_PLAIN`
contains `'після дтп'` / `'после дтп'` alongside `'тотал'` and `'розбит'`. A seller who honestly
writes *«після ДТП замінено бампер»* is treated identically to a total loss — and is killed even
when the AUTO.RIA damage bar is clean. Honest disclosure of trivial damage is currently punished
exactly as hard as concealed structural damage.

Whether the API can grade severity and whether accident presence should clamp the score are
different questions. Only the first is data-blocked.

Two constraints shape the answer. Seller text systematically **understates** damage — nobody
advertises cut pillars — so text may not be trusted downward. And this change alters the live alert
set, which places it squarely inside [[0011-evidence-gated-scoring-rollout|ADR-0011]].

## Decision

1. **Accident presence stops being a blanket hard disqualifier.** `damaged` and
   `desc_after_accident` become graded risk contributions. The ADR-0006 invariant that *a cheap trap
   is not a deal* is preserved by §2, not abandoned.

2. **A severity floor stays hard.** Write-off and structural-integrity evidence remains a
   disqualifier: `salvage` / «на запчастини», total loss («тотал», «розбит»), cut or replaced
   pillars and roof, deployed airbags, altered body geometry, flood, rollover, and the Ukrainian
   market's «конструктор» / «розпил». These are not a discount on a usable car; they are a different
   product.

3. **Severity buckets come from a lexicon, not from the API.** Classification is `cosmetic` /
   `moderate` / `severe` / `unknown`, derived by the same negation-aware technique `condition.ts`
   already uses. This is explicitly *not* the L1/L2/L3 tiering ADR-0018 §5 blocked: it claims no
   structured knowledge of damage location or airbag state, and `unknown` is expected to be the
   modal outcome.

4. **Text may raise severity freely but may lower it only with corroboration.** A description that
   indicates structural damage escalates the bucket. A description claiming the damage was trivial
   may **not** reduce the penalty below the `unknown` level unless VIN evidence corroborates it.
   This is the same asymmetry [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] applies to
   claimed mileage, and it is what prevents a seller from typing their way into a better score.

5. **`unknown` is penalized, not excused.** `damaged = true` with no lexical evidence is the common
   case. It receives a bounded penalty **and** a "verify before travelling" marker. The system's
   position is that it does not know how bad the damage is — not that the damage was minor.

6. **Shadow first, flip second.** The classifier ships computing and recording its verdict while the
   current hard disqualifier stays live. Only after a rollout report shows how many listings the
   clamp is currently suppressing, and how they distribute across buckets, may one operator-approved
   `ParameterSet` change flip the graded penalties on. Precision is compared before and after in
   `/report`.

7. **ADR-0018 §5 is narrowed, not reversed.** Deriving structured damage location, airbag state, or
   frame condition from the free AUTO.RIA API remains blocked, and reopening *that* still requires a
   VIN-report data decision. What is reopened is only the clamp.

## Consequences

**Positive.** The operator stops losing an entire category of real inventory — lightly damaged cars
bought cheap and resold at a modest repair cost are ordinary business, and the system currently
cannot see them at all. Honest sellers stop being penalized for disclosure. The graded penalty also
composes naturally with [[SPEC-006]]'s `C_rec`, where post-accident risk becomes an expected repair
cost in dollars rather than a boolean.

**Negative / to maintain.** Alert volume will rise, against a standing "don't spam the operator"
rule — which is why §6 makes the flip measured and reversible rather than immediate. A severity
lexicon is now a maintained artifact that will contain errors; it is versioned config with an audit
trail, like the other heuristic tables. The interaction with the `suspicious_discount > 45%` clamp
must be re-validated at rollout: a graded accident car that is legitimately half price is still
killed by that separate rule, and this decision deliberately does not change it.

**Risk accepted.** If the rollout report shows accident-flagged listings were reliably bad deals,
the clamp was empirically earned and the flip should not happen. §6 exists so that outcome is
visible before the change, not after.

## Related

- [[decisions/README]] · [[0018-assessment-confidence-and-monetary-output|ADR-0018]] (narrowed) ·
  [[0006-operator-profit-vision|ADR-0006]] (the trap invariant this preserves) ·
  [[0011-evidence-gated-scoring-rollout|ADR-0011]] (the gate this falls under) ·
  [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] (the corroboration asymmetry reused) ·
  [[0019-advisory-only-ai-analysis|ADR-0019]] (`/analyze_ai` covers the ambiguous cases)
- Spec: `018-graded-accident-risk`
- [[profitability-definition]] · [[profitability-methods-coverage]] · [[glossary]]
- Discovery note: `context/log/2026-08-03-breakdown-and-ai-analysis.md`
