---
title: Drivetrain-banded cohort tiers
type: context
updated: 2026-08-06
---

# 2026-08-06 — narrowing the cohort with trim/generation proxies

## Ask

Operator, immediately after [[0023-one-sided-mileage-adjustment|ADR-0023]]: "fix the cohort — add
trim and generation."

## What the investigation found

The live benchmark comes from `GET /auto/average_price`, and that endpoint has **no generation and
no modification parameter**. Its whole filter set is `marka_id`, `model_id`, `yers[]`, `raceInt[]`,
`gear_id[]`, `fuel_id[]`, `auto_options[]`, `city_id`. Generation and modification are catalog
resources there, not query parameters (verified against the RIA REST API docs).

They exist on `POST /auto/ai-avarage-price/`, and `AutoRiaAiValuationProvider` already sends
`generationId` and `modificationId` — but that path is paid, credential-gated and shadow-only under
[[0017-shadow-valuation-evidence|ADR-0017]] §5. So the literal ask is a provider promotion, not a
cohort change.

Presented both paths to the operator, who chose **proxies now, AI later**.

## Change

`src/modules/valuation/cohort.ts` — two tiers above the existing year±1 cohort:

1. make+model + **exact year** + gearbox + fuel
2. make+model + **year±1** + gearbox + fuel

Gearbox+fuel proxies trim; exact year proxies generation. Both are named as proxies in the code
comment, the glossary and `/why`'s tier string — never as the real thing. The widening ladder is
untouched underneath, so a thin proxy cohort still falls through to the broad one and the starvation
diagnosed in [[why-no-opportunities]] cannot return.

Supporting changes, all load-bearing:

- `CohortQuery` gains `gearboxId` / `fuelId`; the adapter sends them as `gear_id` / `fuel_id`.
- New `SourceNoDataError` (HTTP 400 "Not Enough Data"). `averagePrice` converts it to a zero-sample
  result so `BenchmarkCacheService` caches the barren cohort. Without this the narrow tiers would
  re-pay a failed request for every listing matching them — a pre-existing amplifier that only
  became expensive once thin tiers were normal.
- `BenchmarkCacheService.cohortKey` **appends** the band rather than folding it into the seven fixed
  fields, so a bandless key stays byte-identical to stored history. `average_price_snapshots` and
  `listing_disappearances.cohortKey` join on that string for SPEC-004 calibration; a test pins it.
- `assessment-confidence.ts` gains `make_model_year_exact_trim: 0.85` and
  `make_model_year_trim: 0.75`. Display-only and never multiplied (ADR-0018), but omitting them
  would have scored the new tiers as zero coverage.
- `cohortTier` now derives the label from the cohort's shape instead of its array index. The old
  index form could only ever return `make_model_fallback` for the widest tier, which is preserved.

Decision recorded as [[0024-drivetrain-banded-cohort-tiers|ADR-0024]].

## Not done, deliberately

- **The AI endpoint stays shadow-only.** ADR-0017 §5 needs a separate approved decision; queued on
  [[Roadmap & Status]] with its operator gates named.
- **No `auto_options` filter.** The endpoint AND-combines equipment options, which would starve the
  sample far faster than gearbox+fuel for a much weaker price signal.
- **No engine-volume band.** `engineVolumeFrom/To` is a `/search` parameter, not an
  `/average_price` one.
- **No ParameterSet change.** Deterministic comparability fix, outside the ADR-0011 gates.

## Direction of effect — worth watching

Unlike ADR-0023 this is **not** safe-by-construction: a benchmark can move either way. A base trim
previously flattered by loaded comparables will show a smaller discount; a loaded trim a larger one.
Both are more truthful, and both change the alert set. The first production cycles deserve a look at
`/best` and the tier strings in `/why` to confirm the new tiers are actually matching rather than
falling straight through.

## Verification

Native Windows `npm.cmd` (RTK's wrapper is Linux/musl and does not run here): `typecheck`, `lint`,
Jest **549/549** (65 suites), `nest build` — all pass. The stale worktree was excluded with
`--testPathIgnorePatterns worktrees`; its pre-existing timeout flake is unrelated and unchanged.

## Follow-up

Segment mileage norms (CHANGE-003.3) become more tractable with a tighter cohort — a cohort median
mileage is a better expectation than flat `age × 15k`, and the drivetrain band makes that median
mean something.
