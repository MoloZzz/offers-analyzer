---
title: Current task handoff
type: context
updated: 2026-08-03
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

SPEC-015, Defensible valuation evidence, is implemented at
`specs/015-defensible-valuation-evidence/`. It adds an official AUTO.RIA AI provider-evidence path
for the target `active_listing_ask`, but only as disabled-by-default shadow mode. The code includes
typed provider/source facts, immutable redacted evidence/policy records, dedicated `valuation_ai`
budget allocation, source-free `/why`, and admin-only `/valuation_audit`.

The existing scoring, lifecycle, and budget rollout gates remain unchanged. The implementation did
not apply its additive migration, ship credentials, make source traffic, or change fair value,
score, alert, threshold, ParameterSet, factor, or survivorship correction `k`.

## Also open (2026-08-03)

[[0018-assessment-confidence-and-monetary-output|ADR-0018]] accepted the operator's scoring-proposal
review: assessment confidence becomes a separate, **never-multiplied** output built from zero-cost
fields, [[SPEC-006]] is promoted ahead of the remaining spec-003 factors and formalized at
`specs/006-monetary-output-z-roi/`, and graded accident severity was closed as data-blocked — a
closure **narrowed the same day by [[0020-graded-accident-risk|ADR-0020]]** (see below). Only
SPEC-006 US6.1 is ungated; every monetary slice still waits on SPEC-004 `k`, SPEC-007, SPEC-008 and
the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates. No code was changed by that task.

Later the same day, [[0019-advisory-only-ai-analysis|ADR-0019]] admitted advisory AI services as a
new external-system class (constitution v1.2.0 → v1.3.0) and two specs were formalized:
`016-full-evaluation-breakdown` (compact alert + **Деталі** button over one shared renderer) and
`017-on-demand-ai-analysis` (admin-only `/analyze_ai`, cached, separately budgeted, advisory-only
permanently). Both are presentation/advisory and change no score or alert set. Spec 017 ships
disabled; provider credentials, approved terms, lawfulness of sending listing content, and a monthly
cap are operator gates. No code was changed by either task.

## Implemented 2026-08-03 — SPEC-018 phase 1 (T001–T006)

The accident-severity classifier is in code: `src/modules/valuation/accident-severity.ts` (pure),
`config/heuristics/accident-severity.json` (versioned lexicon, loaded and content-hashed by
`HeuristicTablesService`), a 55-case labelled uk+ru corpus at `test/fixtures/accident-corpus.ts`,
and 14 tests including the SC-002/SC-003 anti-gaming properties.

**Nothing consumes the verdict.** `red-flags.ts`, `condition.ts`, `valuation.service.ts`, the score
and the alert set are untouched, so this pass changes nothing observable and is outside the
[[0011-evidence-gated-scoring-rollout|ADR-0011]] gates. Phase 2 (shadow persistence + the rollout
report) and phase 3 (the operator-approved flip) are open — see
`specs/018-graded-accident-risk/tasks.md` T007 onward and
`context/log/2026-08-03-graded-accident-risk.md` for the implementation decisions.

## Next pickup

For the next task, read this handoff and `specs/015-defensible-valuation-evidence/quickstart.md`.
Confirm official AUTO.RIA AI permission, allowed storage/attribution, effective pricing/allocation,
and sanitized fixture parity before enabling any provider request. On an operator-approved
development database, apply and regenerate the additive migration to verify no schema churn. Then
collect the pending gold-case strata and review `/valuation_audit`. Do not promote active-listing
evidence to a resale model or change the live score without a separate approved decision.

## Verification / blockers

- Completed on 2026-08-02 (native Windows `npm.cmd` through RTK): `typecheck`, `lint`, full Jest
  (309 tests), contract Jest (23 tests), Nest build, `vault:build`, `vault:check:strict`, and
  `vault:test` all pass.
- 2026-08-03 (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here):
  `typecheck`, `lint`, contract Jest (23), and Nest build pass. Full Jest is **322/323** — the one
  failure, `single-flights concurrent calls…` in `test/unit/valuation-evidence.service.spec.ts`,
  exceeds Jest's 5 s timeout and is **pre-existing and unrelated to SPEC-018** (it fails identically
  with the spec-018 changes reverted, and that spec imports nothing touched by them). It is SPEC-015
  work and still needs its own task.
- The remaining blockers are external/operator gates only: approved provider credentials/terms and
  allocation, a development migration apply/re-generation check, pending gold-case captures, and
  the `/valuation_audit` review. Leave `AUTO_RIA_AI_ENABLED=false` until those gates are complete.
- 2026-08-03: `ai-infra/` and its `ai-infra:test` script/CI step were removed; the kit now ships
  from <https://github.com/MoloZzz/ai-support-system> ([[0016-portable-ai-infra-kit|ADR-0016]]).
  This project's instruments are unchanged — `tools/vault/` is a superset of the extracted core.
- Claude hooks are deliberately optional; Codex and other runtimes use the explicit brief/handoff
  protocol. The optional PostgreSQL evidence extension is documentation only and did not query a
  database in this task.
- Confirm code and deployment state before acting on a roadmap item. Record concrete work in a new
  dated context/log/ file and promote durable facts before closing the task.
