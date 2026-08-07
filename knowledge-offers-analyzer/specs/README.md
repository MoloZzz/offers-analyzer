---
title: Feature specs index (SDD)
type: moc
updated: 2026-08-02
---

# Feature specs index

> Bridge between the vault and Spec Kit. The repo-root `specs/` directory holds the feature specs; `.specify/` holds the Spec Kit tooling, memory, templates, and workflows used to produce them. Link each spec here with a one-line summary so the knowledge base stays the single map.

## Specs

| Spec | Summary | Status |
|------|---------|--------|
| `../../specs/001-profitable-listing-alerts/spec.md` | Monitor configured AUTO.RIA niches -> flag below-fair-value, low-risk listings -> alert via Telegram | Draft (v1 MVP implemented; mileage/condition/report follow-ups pending) |
| `../../specs/002-auto-calibration-learning/spec.md` | Capture outcomes -> auto-calibrate the alert threshold -> learn scoring weights; transparent, bounded, human-in-the-loop | Draft (E1-E4 implemented; `disappeared` signal + per-profile precision auto-apply deferred) |
| `../../specs/003-composite-deal-score/spec.md` | Rank by probability of operator profit ([[0006-operator-profit-vision|ADR-0006]]): composite Total Deal Score - price core (dominant) x liquidity x repair-risk x negotiation x seller x positives; 0-100 explanation; segment mileage norms | Draft (core score implemented but intentionally inactive in prod per [[0010-defer-factor-activation-until-k|ADR-0010]]; factor activation deferred until SPEC-004's `k` lands, then one combined ParameterSet change + single threshold re-validation, owned by spec 004 Phase C; negotiation/seller/positives/mileage pending) |
| `../../specs/004-realized-price-calibration/spec.md` | Survivorship correction to `fair_value`: measure candidate `k` from listing disappearances, validate its quality, then apply `X = RIA_average x k` | Draft (US4.1-US4.2 + US4.1b implemented 2026-07-23; US4.3 + US4.3a readiness gate + US4.4 pending) |
| `../../specs/005-listing-lifecycle-rechecks/spec.md` | Re-check active listings by score proximity and seller behavior so meaningful price cuts are re-scored and alerted | Paused (formalized 2026-07-28; implementation waits for demonstrated operator profit, then SPEC-009 evidence and operator approval) |
| `../../specs/007-deal-outcomes/spec.md` | Capture real post-deal economics (bought/declined/sold + prices + costs + realized DOM) as a stateful `deal_outcomes` record, and compute realized margin (`sell - buy - costs`) - the ground truth 👍/👎 only approximates | Draft (US7.1-US7.2 implemented 2026-07-23; US7.3 (re-target auto-tuning, CHANGE-002.1) + US7.4 (`Z` calibration) pending) |

| `../../specs/006-monetary-output-z-roi/spec.md` | Projected dollar profit `Z` and `ROI` beside the 0–100 score, replacing the dimensionless liquidity/repair-risk multipliers with money; plus a separate, never-multiplied **assessment confidence** output | **US6.1 implemented 2026-08-04** (T001–T013: assessment confidence, its non-multiplication guard, alert and `/why` rendering); phases 4–7 remain Draft. Promoted ahead of the remaining spec-003 factors by [[0018-assessment-confidence-and-monetary-output|ADR-0018]]; the monetary slices wait on SPEC-004 `k`, SPEC-007, SPEC-008 |

| `../../specs/010-budget-stabilization/spec.md` | Reduce legacy rechecks and unshareable cohort requests while preserving production discovery | Implemented; observe ledger before any further budget expansion |

| `../../specs/011-valuation-sanity-guards/spec.md` | Prefer median AUTO.RIA benchmarks and prevent unverified or old claimed mileage from inflating fair value | Implemented 2026-07-29; no additional API calls |
| `../../specs/012-executable-vault/spec.md` | Preserve the curated second brain while adding generated context, bounded retrieval, source mapping, and phased vault enforcement ([[0015-hybrid-executable-vault|ADR-0015]]) | Implemented 2026-08-02; strict CI baseline is clean, source pins start narrowly, and Claude hooks remain optional |
| `../../specs/013-portable-ai-infra/spec.md` | Extract reusable second-brain, product-loop, and context-control mechanisms into a versioned bootstrap kit ([[0016-portable-ai-infra-kit|ADR-0016]]) | Implemented 2026-08-02, then **migrated out** 2026-08-03 — the kit ships from <https://github.com/MoloZzz/ai-support-system>. Spec retained as history; no `ai-infra/` code remains here and no Offers instrument depends on it |
| `../../specs/015-defensible-valuation-evidence/spec.md` | Capture first-party AUTO.RIA provider evidence for an explicitly labelled active-market asking-price estimate, with immutable provenance, conservative review states, and source-free /why | Implemented as a shadow-only, disabled-by-default evidence path; provider traffic/audit rollout and every scoring change remain pending ([[0017-shadow-valuation-evidence|ADR-0017]]) |
| `../../specs/016-full-evaluation-breakdown/spec.md` | One breakdown renderer over the persisted evaluation explanation, reached from a compact alert via a **Деталі** inline button and shared by `/why` and `/check` | **Fully implemented 2026-08-05** (T001–T022, all four user stories): one pure builder, every `/why` and `/check` formatter reduced to a thin adapter over it, the 📋 **Деталі** button delivering the full breakdown from storage with zero source requests, `/check` rendering the same section layout and declaring itself the only surface that spends a source request, and a differential test proving new parameters render with no renderer change. Presentation-only and ungated throughout |
| `../../specs/017-on-demand-ai-analysis/spec.md` | Admin-only `/analyze_ai` — structured context to a language model, strict structured output (warnings, inspection checklist, seller questions, advisory score), content-hash cache, separate budget, immutable records | **Fully implemented 2026-08-06/07** — all phases (T001–T037 bar the operator gates): quarantined context assembly, strict validate-or-discard output, the non-influence and module-boundary guards, the dedicated `ai_analysis` allocation under its own source key, an Anthropic adapter behind `AnalysisProvider`, the immutable `AiAnalysis` record, admin-only `/analyze_ai`, the content-hash cache (checked before admission, single-flighted, hits marked with their original capture time and recorded as `cached` marker rows), admin-only `/ai_audit`, an admin-only inline button, and a curated-table contradiction display that shows both sides and reconciles nothing. Advisory-only **permanently** and shipped disabled per [[0019-advisory-only-ai-analysis|ADR-0019]]; provider credentials, terms, lawfulness of sending listing content, and a monthly cap remain operator gates |
| `../../specs/018-graded-accident-risk/spec.md` | Replace the blanket accident clamp with a lexicon-derived severity verdict (`cosmetic`/`moderate`/`severe`/`unknown`); hard floor kept for write-off and structural evidence; seller text may raise severity but may lower it only with VIN corroboration | Phases 1–2 **implemented 2026-08-03** ([[0020-graded-accident-risk|ADR-0020]]): classifier, shadow recording in `EvaluationExplanationV3`, and the admin-only `/accident_shadow` rollout report — all ungated and observationally free. **The flip to graded penalties changes the alert set and requires a month of shadow evidence plus operator approval** per [[0011-evidence-gated-scoring-rollout|ADR-0011]] |

## Vault-side spec notes

Four short notes sit beside this index. They are the vault's navigable handles for specs, so
`[[SPEC-005]]` resolves in Obsidian and an ADR can link a spec without reaching into the repo-root
Spec Kit package. They are **not** a second source of truth — where a formal spec exists, it wins.

All spec notes live in this directory. That is enforced: a `type: spec` note outside
`specsDir` is a `spec-misplaced` finding in `vault check` ([[0021-retrieval-discipline-by-default|ADR-0021]]).

| Note | Kind | Summary | State |
|---|---|---|---|
| [[SPEC-005]] | Pointer → `../../specs/005-listing-lifecycle-rechecks/` | Listing lifecycle and tiered re-check | Paused |
| [[SPEC-006]] | Pointer → `../../specs/006-monetary-output-z-roi/` | Monetary output `Z` and ROI | US6.1 implemented; monetary slices Draft |
| [[SPEC-008]] | **Backlog only — no formal spec** | Cohort market drift correction | P2, captured in `../context/backlog.md` (2026-07-22) |
| [[SPEC-009]] | Pointer → `../../specs/009-budget-observability/` | Budget observability and rollout guardrails | Implemented, P0 |

`SPEC-008` is the only one not yet run through `/speckit-specify` — an addendum to ADR-0006/spec 003
and spec 002. Promote it to a formal repo-root `specs/<id>/spec.md` before implementation per SDD
(§2 of `CLAUDE.md`); when you do, **rewrite the note into a pointer in the same task** rather than
leaving a stub and a spec that both claim to describe it.

`ADR-0009` (monthly rate-limit pool + priority queue) funds SPEC-005 and is Accepted.

`SPEC-009` is formalized at `../../specs/009-budget-observability/`: it is implemented with a
durable allowed/denied budget ledger and read-only `/budget` report. The rollout gate becomes
evidence-ready only after the current month's ledger reconciles with the pool and its forecast
fits the allocation; it does not auto-enable SPEC-005 or profiles.

`SPEC-014` is implemented at `../../specs/014-telegram-monitoring-control/`: it adds durable,
admin-only Telegram controls to disable/re-enable the AUTO.RIA daily request limit while retaining
the monthly pool cap.

## Constitution

Project principles are ratified in `../.specify/memory/constitution.md` (v1.3.0, 2026-08-03) —
the non-negotiable rules every spec must satisfy. Amendments require an ADR + version bump.
v1.3.0 admitted advisory AI services as a distinct external-system class under a hard
advisory-only boundary ([[0019-advisory-only-ai-analysis|ADR-0019]]).

## How this connects

- Author specs with the SDD workflow — see [[environment-setup]].
- When a spec is implemented, reflect the resulting design in [[overview]] and any new terms in [[glossary]].

## Related

- [[00-INDEX]]
- [[coding-standards]]
