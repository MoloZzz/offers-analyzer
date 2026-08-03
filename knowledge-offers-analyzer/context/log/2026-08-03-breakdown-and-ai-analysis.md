---
title: Formalization — full evaluation breakdown and on-demand AI analysis
type: context-log
date: 2026-08-03
updated: 2026-08-03
---

# Formalization — full evaluation breakdown and on-demand AI analysis

## Trigger

Operator asked for (1) a full per-parameter description of calculated listings in alerts, and
(2) a new feature: an admin-triggered request for AI analysis from an alert, sending a prepared
structured context and receiving structured output with warnings and a score.

Operator choices recorded during clarification: compact alert plus a **Деталі** button; AI as a
separate feature with a cache, invoked from the bot as `/analyze_ai …`; the AI verdict may **never**
affect the score, alert set, or threshold.

No code was changed. This task produced decisions and specifications only.

## Validation findings

**Breakdown (1).** The data already exists — `EvaluationExplanation` persists every parameter (B23)
and `formatWhy` / `formatStoredWhy` already render most of them. The gap is *reach*, not data: the
detail is only obtainable via `/why` at the moment the operator is looking at an alert that has the
listing right there. A second, quieter problem drove the design: four formatters
(`formatOpportunity`, `formatPriceDrop`, `formatAssessment`, `formatWhy`/`formatStoredWhy`) render
overlapping subsets of the same evaluation, and every new parameter must be added to each. The spec
therefore builds **one renderer shared by three surfaces** rather than adding a fifth variant.

Sequencing note: the breakdown is thin today. `score === priceCore`, `result.factors` is empty
(spec-003 factors inactive per [[0010-defer-factor-activation-until-k|ADR-0010]]), and
`assessmentConfidence` and `monetary` do not exist yet. Its value grows automatically as the
combined rollout and [[SPEC-006]] land — spec 016 US16.4 exists to prove that needs no renderer
change.

**AI analysis (2).** Four project properties made the trust boundary the decisive question:

- No sold-price ground truth. [[profitability-methods-coverage]] §5 rejects ML *for scoring*. That
  verdict does not speak to a model consulted by a human who already decided to look at one car.
- Explainability is a product feature — a model answer is not reproducible by re-running it, so it
  must be persisted immutably and rendered from the record.
- The description is written by the seller, so any path where model output influences behaviour is a
  prompt-injection surface. Today seller text reaches only a deterministic keyword scanner.
- An LLM spends a different currency than the AUTO.RIA pool and needs its own ceiling.

The containment answer is that consequence is bounded, not that input is filtered: because output
can never reach a score or an alert, a successful injection produces at most a misleading advisory
paragraph. Filtering seller text would be an unwinnable arms race.

Recorded reservation ([[0019-advisory-only-ai-analysis|ADR-0019]] §8): the AI numeric score is the
weakest output in the system — no ground truth, not reproducible, and visually authoritative next to
a deterministic score. The value is in the warnings, the inspection checklist, and the questions to
ask the seller. The score is specified because it was requested, but rendered subordinate and
labelled.

## Decisions and artifacts

- [[0019-advisory-only-ai-analysis|ADR-0019]] — advisory-only permanently, admin-triggered,
  cached, immutably recorded, separately budgeted, description-as-untrusted-data. The asymmetric
  "may veto only" variant was considered and rejected: a veto still lets seller-authored text decide
  what the operator sees.
- Constitution v1.2.0 → **v1.3.0** (MINOR) — advisory AI services admitted as a distinct
  external-system class under that boundary.
- `specs/016-full-evaluation-breakdown/` — spec, plan, tasks.
- `specs/017-on-demand-ai-analysis/` — spec, plan, tasks.

## Enforcement chosen

The advisory-only boundary is enforced physically, not by convention: `valuation` never imports
`analysis`, and a lint/architecture test fails CI on that import. The same reasoning keeps spec
016's callback module free of `LISTING_SOURCE`, which makes its zero-request guarantee structural
rather than disciplinary.

## Open operator gates

Spec 017 ships disabled. Before enabling: provider credentials, approved provider terms,
confirmation that listing content may lawfully be sent to that provider, and an agreed monthly cap.
Vendor and model selection are deliberately not spec content.

## Related

- [[0019-advisory-only-ai-analysis|ADR-0019]] · [[0018-assessment-confidence-and-monetary-output|ADR-0018]] ·
  [[0017-shadow-valuation-evidence|ADR-0017]] · [[0011-evidence-gated-scoring-rollout|ADR-0011]]
- [[profitability-methods-coverage]] · [[explainability-gaps]] · [[specs/README]] · [[Roadmap & Status]]
- Prior review: `context/log/2026-08-03-scoring-proposal-review.md`
