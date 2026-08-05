---
title: SPEC-016 phases 1–2 — one breakdown renderer + the Деталі button
type: context-log
date: 2026-08-05
updated: 2026-08-05
---

# SPEC-016 phases 1–2 (T001–T014)

Implemented the MVP of `016-full-evaluation-breakdown`: the shared breakdown builder and the
operator-facing 📋 **Деталі** button. Presentation-only — no score, threshold, `ParameterSet`, or
alert-set change, so it sits outside the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates.

## What was built

| File | Role |
|---|---|
| `format/breakdown.types.ts` | `Breakdown` / `BreakdownSection` / `BreakdownLine` value objects + the `availability` model |
| `format/breakdown.ts` | The one builder. `buildBreakdown(explanation, evidence?)` and `buildLiveBreakdown(detail, result, ctx)` normalize to one internal fact set, then run a single section pipeline |
| `format/flag-labels.ts` | `FLAG_LABELS` extracted out of `opportunity-message.ts` so the builder does not import the formatter it feeds |
| `format/why-message.ts` | Reduced from ~270 lines to two one-line adapters over the builder |
| `telegram/details-callback.ts` | `details:<listingId>` encode/parse + section-boundary message splitting. **No imports at all** |
| `query/query.service.ts` | `storedBreakdownById` — storage-only read, discriminated over `ok` / `listing_missing` / `no_explanation` |
| `notifications.service.ts` | Third button row: 📋 Деталі, carrying `listing.id` |
| `telegram-bot.update.ts` | `@Action(/^details:/)` handler |

Tests: `test/unit/breakdown.spec.ts` (21), `test/unit/details-callback.spec.ts` (8),
`test/integration/details-button.spec.ts` (5).

## Decisions taken during implementation

- **Section order follows the spec, not the old `/why` line order.** `📊 Загальний бал` used to sit
  second, above the price line; it now lives in the `score` section where it belongs. Every line's
  *text* is unchanged — only ordering moved — and the existing `/why` tests assert substrings, so
  nothing broke. The spec mandates a decision-ordered layout shared across surfaces (SC-004); a
  renderer that preserved the historical ordering could not also satisfy that.
- **A `provider` section was added** between `mileage` and `score`. The planned section list in
  `tasks.md` T003 had no home for the SPEC-015 stored evidence that `formatStoredWhy` already
  rendered, and dropping it would have been a silent regression.
- **T009 landed in `notifications.service.ts`, not `telegram.notifier.ts`.** The notifier is a
  channel-agnostic transport that renders whatever button rows it is handed; the alert keyboard has
  always been composed in `alertButtons`. Attaching the button in the notifier would have made the
  Telegram adapter know about listings.
- **`buildLiveBreakdown` uses `schemaVersion: 0`** for a computation that was never persisted, and
  reports its missing `ParameterSet` as `availability: 'unavailable', reason: 'live'` rather than
  inventing a version. A live `null` confidence reports `unmeasured`, never "too old a schema" —
  those are genuinely different facts and the operator must be able to tell them apart.
- **The spec-018 `accidentSeverity` shadow verdict is deliberately not rendered.** It stays behind
  admin-only `/accident_shadow` until phase 3 is approved ([[0020-graded-accident-risk|ADR-0020]]);
  surfacing it in an operator breakdown would leak a decision that has not been made. Asserted by a
  test so a later "render everything the record carries" refactor cannot do it by accident.
- **`/check` kept its compact shape.** T005 wires it to the builder for its score total and risk
  line — deleting the duplicated flag grouping — but the full section layout is T016 (phase 3).
  Visible consequence: `/check` now groups risks by source (`дані AUTO.RIA: … · опис: …`) exactly as
  `/why` does. That is the shared-renderer behaviour, and it is a copy change to `/check`.

## Known wart, deliberately not fixed

`desc_*` flag labels already carry their own `опис:` prefix, so a grouped risk line reads
`опис: опис: потребує ремонту`. This predates spec 016 — `formatStoredWhy` did the same — and
fixing it is a `/why` copy change with its own test churn, not part of this spec. Pinned by a test
comment in `breakdown.spec.ts` so it is a known state rather than a surprise.

## Verification (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here)

`typecheck`, `lint` (`--max-warnings 0`), Jest **526/526** across 63 suites (unit + integration +
contract), and `nest build` all pass. Runs used `--testPathIgnorePatterns worktrees` because Jest
still scans the stale `.claude/worktrees/eager-easley-3aaaf6` worktree — that worktree belongs to no
active task and should be removed.

## Still open on this spec

Phase 3 (T015–T017: `/check` adopts the full section layout, formatters reduced to thin adapters)
and phase 4 (T018–T019: test-only forward-compatibility proof). Neither is blocked by anything.

## Related

[[explainability-gaps]] · [[Roadmap & Status]] · [[overview]] · [[glossary]]
