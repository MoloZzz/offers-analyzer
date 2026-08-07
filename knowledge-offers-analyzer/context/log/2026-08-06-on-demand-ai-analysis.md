---
title: SPEC-017 on-demand AI analysis — MVP (phases 1–3)
type: context
updated: 2026-08-06
---

# SPEC-017 `/analyze_ai` — MVP implemented, ships disabled

Scope chosen by the operator: **phases 1–3 (T001–T025)**, the spec's own stated MVP, plus the
phase-6 vault and verification tasks (T034–T036). Vendor for the first adapter: **Anthropic**.
Phase 4 (content-hash cache) and phase 5 (`/ai_audit`, inline button, contradiction display) are
deliberately not built yet.

## What was built

| Piece | File |
|---|---|
| Pure context assembly + `inputFactHash` | `src/modules/analysis/analysis-context.ts` |
| Strict range-checked output validation | `src/modules/analysis/analysis-output.ts` |
| Versioned prompt/sampling/ranges policy | `src/modules/analysis/analysis-policy.ts` |
| Provider port | `src/modules/analysis/ports/analysis-provider.port.ts` |
| Anthropic adapter (forced tool call, `undici`, no SDK) | `src/modules/analysis/providers/anthropic-analysis.provider.ts` |
| Immutable attempt record + additive migration | `entities/ai-analysis.entity.ts`, `1785400000000-spec-017-ai-analysis.ts` |
| Orchestration: admission → assemble → call → validate → persist | `src/modules/analysis/analysis.service.ts` |
| Dedicated allocation under its own source key | `scheduling/rate-budget.service.ts` (`tryConsumeAiAnalysis`) |
| Reply formatter | `notifications/format/ai-analysis-message.ts` |
| Admin-only command | `notifications/telegram/telegram-bot.update.ts` (`/analyze_ai`) |

## Decisions worth keeping

**The untrusted-block delimiter is derived from the hash of the quoted text.** A fixed token would
hand the seller a way to close the block and continue in instruction position. Deriving it from
`sha256(text).slice(0,16)` removes that move without filtering, trimming, or rewriting a single
character of what they wrote — closing the block would require predicting the digest of a string
containing that digest. Filtering seller text was rejected outright: it is an arms race, and
plan.md's reasoning holds — the real defence is containment of *consequence* (FR-002), not
sanitation of input.

**The non-influence guard compares two isolated module registries.** `jest.isolateModules` scores
the corpus once in a registry where `analysis` was loaded and exercised on every case, and once
where it was never required, then compares the score chain and the alert set. That makes "with the
analysis module loaded and unloaded" (T008) a real comparison rather than a figure of speech.

**The module-boundary test also forbids `polling → analysis`,** not just `valuation → analysis`.
FR-001 (human-triggered only) has exactly one quiet death: a poll-time import appearing inside a
loop over new listings. The spec only demanded the valuation edge; the polling edge is the one that
protects the requirement that actually bounds spend.

**AI spend is admitted by a separate method under a separate source key**, not by `tryConsume`.
Routing it through the existing path would have decremented the AUTO.RIA monthly pool and daily
sub-budget — the precise thing FR-006/SC-002 forbid. For the same reason the `/budget` digest
carries AI spend as its own field rather than folding those rows into `ledgerAllowed`, which would
have reported a phantom reconciliation drift.

**Every terminal path persists, including refusals.** A refusal is the fact `/ai_audit` most needs
("we declined to spend, and why"); a silent refusal would be invisible to the audit surface. Five
terminal reasons are distinguished, notably `disabled` vs `not_configured` — "we turned it off" and
"it was never wired" are different operational facts.

**Allocation compensation is asymmetric on purpose.** A failed attempt returns its allocation only
when the provider cannot have billed (`possiblyCharged === false`). A timeout, a 5xx, and a 200 that
produced no usable tool call all keep the charge: guessing generously in the other direction would
silently overspend a paid cap.

**A truncated tool call (`stop_reason: max_tokens`) is discarded whole**, like any schema violation.
A truncated structured answer is exactly the "partial value" FR-004 forbids.

## One vault contradiction found and fixed in code, not in the note

The implementation first used a 0–100 advisory score. `domain/glossary.md` fixes it at **0–10**, and
the note is right: the Total Deal Score is rendered 0–100, so a second 0–100 number beside it reads
as a competing verdict on the same scale — precisely the anchoring [[0019-advisory-only-ai-analysis|ADR-0019]]
§8 exists to prevent. The code was changed to match the vault (`advisoryScoreMax: 10`), the prompt
now states the scale, and `analyze-ai-command.spec.ts` asserts the rendered form is `N з 10` and
contains no `100`.

## What was deliberately *not* done

- **No cache.** Phase 4. The entity and its composite index exist and the record carries everything
  the lookup needs, but nothing reads it yet. This is the operator's explicit requirement and the
  difference between cost tracking decisions and cost tracking taps — it should land before the
  feature is enabled, not after.
- **No `/ai_audit`, no inline button, no contradiction display.** Phase 5.
- **The migration was not applied.** Additive and append-only; apply on an operator-approved
  database, then check TypeORM generates no follow-up churn.
- **No new dependency.** The adapter is one `undici` POST, like the AUTO.RIA one; the vendor
  coupling stays inside a single file behind the port.

## Verification (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here)

`typecheck`, `lint`, unit Jest **637/637** (73 suites), contract Jest **108/108** (13 suites),
`nest build` — all pass. Contract Jest still scans stale `.claude/worktrees/*` copies, which
inflates its suite count; the unit run used `--testPathIgnorePatterns worktrees`.

Two pre-existing test doubles needed a method the new code calls (`OperationBudgetState.findOne`,
`BudgetActivity.count`); `TelegramBotUpdate` gained a ninth constructor argument, so three existing
specs were updated at their call sites.

## Related

[[0019-advisory-only-ai-analysis|ADR-0019]] · `specs/017-on-demand-ai-analysis/` ·
[[Roadmap & Status]] · [[architecture/overview]] · [[operations/environment-setup]]
