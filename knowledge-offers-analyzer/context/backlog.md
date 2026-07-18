---
title: Backlog — living execution queue
type: context
updated: 2026-07-17
---

# Backlog

The single **working queue** we pull from (step 4 of our flow: plan → stages → tasks+backlog →
execute). Ordered by priority. `tasks.md` holds the formal per-feature breakdown; this backlog
spans features, refinements, tech-debt, and deferred ideas, and points into specs where relevant.

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[blocked]`.

## 🔴 Now — correctness / unblock the running pipeline

- [ ] **B1 — Regenerate the DB migration.** The committed initial migration still has the old
  `discountThresholdPct`. Existing dev data is disposable. Delete `src/common/database/migrations/*.ts`,
  `npm run migration:generate`, `migration:run`. (Migrations-only now — see [[coding-standards]].)
- [x] **B2 — AUTO.RIA field mappings validated** against live responses. `search`/`info` fixed;
  red-flags enriched from `autoInfoBar`; `/average_price` confirmed → fair value now uses the robust
  **`interQuartileMean`** (not the outlier-skewed `arithmeticMean`), `total` = sample size. Full map in
  `contracts/auto-ria-api.md`.
- [x] **B3 — Search strategy: N+1** (`search` = ids only). `countpage=100` **done**. Freshness **done**
  via the `top` submission-period filter (see B19) — note: AUTO.RIA `order_by` has **no** "newest" value
  (only 0/1/2), so newest-first is `top`, not `order_by`. **Budget-smart scanning done** (see B20):
  round-robin across profiles + per-profile cap so one niche can't hog the ~30 req/hr budget.
- [~] **B4 — Make the pipeline run:** now driven by `config/search-profiles.json` (copy the example,
  set numeric ids + `enabled: true`, restart). **User action** to go live.

## 🟡 Next — US2 (operator config + currency)

- [~] **B5 — SearchProfile config (operator).** Declarative `config/search-profiles.json`, upserted by
  `name` on boot, implemented. Remaining (optional, later): richer editing via bot command / API.
- [x] **B6 — FX / currency:** NBU `ExchangeRate` adapter (daily-cached, falls back to rate 1);
  comparison stays in USD (ratios are currency-agnostic), Opportunity amounts are converted to the
  profile's currency for storage/alert. Contract-tested. FR-014.
- [x] **B7 — Per-profile config applied** end-to-end: minDealScore ✅, dealer policy ✅, currency ✅
  (conversion), enable/disable ✅. (Dedicated wiring unit test still optional.)

## 🟡 Next — US3 (trust & bot)

- [x] **B8 — Telegram bot commands:** `/start`, `/stop`, `/mute`, `/profiles`, `/help`
  (`TelegramBotUpdate` + `SubscribersService` + `ProfilesService`). FR-015.
- [x] **B9 — Richer alert:** leads with the deal score, shows asking vs market, discount, confidence,
  seller, Ukrainian risk labels, and the AUTO.RIA backlink. Unit-tested. Spec 001 US3 / FR-007.
- [x] **B-bot-query — On-demand bot queries:** `/check <id|url>` evaluates a specific listing live
  (fetch → value → reply with the deal score), `/top` lists the best-scoring saved opportunities.
  `QueryService` + `QueryModule` (reuses source + valuation + listings). Lets the operator check any
  car instantly instead of waiting for the poll.

## 🔵 Business-value push (2026-07-16) — reach non-zero opportunities

Root cause + plan in [[why-no-opportunities]].

- [x] **B18 — Widen the cohort + surface candidates.** `valuation/cohort.ts`
  (`cohortCandidates` → make+model+year±1, then make+model; `resolveBenchmark` widens until
  `sampleSize ≥ 10`), used by poll + `/check`. Default `minDealScore` lowered **0.3 → 0.15**. New bot
  command **`/best`** lists best-scoring evaluated listings even below the alert bar
  (`QueryService.topCandidates` → `ListingsService.topByScore`). No schema change.
- [x] **B19 — Newest by market.** `submittedWithin` query knob → AUTO.RIA `top` submission-period
  filter; a profile with **empty `makeModelPairs`** + region + `priceTo` + `submittedWithin` ingests the
  freshest listings market-wide, each valued against its own widened cohort. Example profile shipped
  **disabled** (budget-heavier — operator opts in). No schema change (`filters` is jsonb).

## 🔵 Valuation refinements (2026-07-17) — accuracy: mileage + condition

Broken into steps per the operator's ask ("обидва підходи, покроково"). Mileage (M), condition (C),
self-tuning reports (R).

- [x] **M1 — Mileage-banded cohort.** `cohort.ts`: `cohortCandidates` now tries
  **make+model+year±1+mileage±25k km** first (a like-for-like average), then year±1, then make+model;
  `resolveBenchmark` widens as before. Cache keys already include mileage. Unit-tested
  (`test/unit/cohort.spec.ts`). No schema change.
- [x] **M2 — Analytic mileage correction (percentage model).** `resolveBenchmark` now returns
  `mileageAware`; when false, `MileageAdjuster` (valuation module) shifts `fairValue` by
  `(expected − actual)/10 × MILEAGE_PER_10K_PCT` %, capped at ±`MILEAGE_MAX_ADJ_PCT`, where
  `expected = age × MILEAGE_ANNUAL_K`. Config defaults 15 / 2% / ±20%. Pure fns unit-tested
  (`test/unit/mileage.spec.ts`); wired into poll + `/check`. No schema change.
- [ ] **M3 — Show mileage context** in the alert/`/check` (e.g. "пробіг 120к vs очікувано 90к → −$800").
- [x] **C1 — Read description.** `description?: string` on `ListingDetail`, mapped from `/info`
  `autoData.description` in `auto-ria.source`.
- [x] **C2 — Condition red-flags.** `valuation/condition.ts` (`assessCondition`) scans the description
  (uk+ru) → `desc_after_accident`/`desc_not_running` (disqualifying), `desc_needs_repair`/
  `desc_mechanical_issue` (soft) in `red-flags.ts`. **Negation-aware**: «вкладень не потребує»,
  «не бита», «після капремонту» do not fire. Positives never inflate the score. Unit-tested
  (`test/unit/condition.spec.ts`).
- [x] **C3 — Wire condition.** `evaluate` parses `input.description` centrally (poll + `/check` just
  pass `detail.description`); Ukrainian labels added to the alert/`/check` risk line. No schema change.
- [x] **R1a — Self-tuning report on demand (`/report`).** `query/report.ts` (pure: `distribution`,
  `suggestedThreshold`, `buildDigest`, `formatReport`) + `QueryService.report()` +
  `ListingsService.scoresForReport`/`nearMisses`. Shows #evaluated, score distribution, near-misses just
  below the threshold, and a suggested `minDealScore` that would yield ~10 candidates. Bot `/report`
  command. Unit-tested (`test/unit/report.spec.ts`). No schema change.
- [x] **B20 — Budget-smart scanning.** `poll()` now searches every profile once (phase 1), then drains
  new listings **round-robin** across profiles (phase 2) and re-observes for price drops (phase 3), each
  budget-guarded. Per-profile cap `MAX_NEW_PER_PROFILE=15` so a market-wide niche can't starve the
  others. Replaces the old profile-by-profile-to-exhaustion loop. No schema change.
- [x] **R1b — Scheduled weekly push.** `ReportSchedulerService` (`@Cron '0 9 * * 1'` — Mon 09:00) builds
  the R1a digest and `NotificationsService.broadcast`s it to active subscribers; skips weeks with 0
  evaluated (no empty spam). Cadence is a one-line constant. No schema change.

## 🟣 Epic — Auto-calibration & learning (spec 002)

Full plan in `specs/002-auto-calibration-learning/` (spec + plan + tasks). Closes the feedback loop on
the rule-based scorer: capture outcomes → auto-calibrate the threshold → learn weights. Transparent,
bounded, reversible, human-in-the-loop, stored-data-only (no API budget). Sequenced:

- [ ] **E0** — research.md + **ADR-0005** (versioned ParameterSets + calibration) + supersession sweep.
- [x] **E1 (foundational)** — scoring reads from a **versioned active `ParameterSet`** (seeded from
  today's config; identical behavior) so any tuning can take effect without redeploy. See
  [[0005-versioned-parameter-sets|ADR-0005]].
  - [x] **E1a — scaffold** (delegated → Sonnet): `ParameterSet` entity + `parameter_sets` migration
    (append-only) + `ParametersService` (seeds v1 from config, caches active) + `CalibrationModule` +
    seed unit test. No consumer refactor; behavior unchanged. tsc clean, jest 29/29.
  - [x] **E1b — consumer refactor** (delegated → Sonnet): pure `computeValuation(input, params)` reads
    `scale`/`softFlagPenalty` from `ParametersService.params()`; `MileageAdjuster` reads mileage factors
    from it; `ValuationModule` imports `CalibrationModule`. `valuation.spec` now drives the pure fn with
    the v1 seed — all original assertions pass (SC-006 regression guard). tsc clean, jest 29/29.
    Supersession sweep done ([[profitability-definition]], [[glossary]], [[overview]]).
- [x] **E2 — US1 (P1): Outcome capture** (MVP of spec 002) — **complete** (E2a–E2d; `disappeared`
  deferred as E2c-later). Feedback now flows: 👍/👎 + `/outcome` + passive `price_dropped` → `outcomes`;
  `/report` shows realized precision. Delivered in safe slices:
  - [x] **E2a — data layer** (delegated → Sonnet): `Outcome` entity + `outcomes` migration (append-only,
    `1784289182080`) + `OutcomesService` (`recordManual` idempotent per opportunity, `recordPassive`
    dedup on listingId+label, `manualLabeledSince` for precision) + fake-repo unit tests. Wired into
    `CalibrationModule` + `ENTITIES`; not consumed anywhere yet. tsc clean, jest 32/32.
  - [x] **E2b — bot surface** (delegated → Sonnet): `Notifier` port gained optional inline `buttons`;
    `TelegramNotifier` sends a keyboard; both alerts carry 👍 Вдала / 👎 Невдала (callback `oc:<label>:<opId>`
    via pure `outcome-callback.ts`, tested). Bot `@Action(/^oc:/)` records the manual outcome (resolves
    opportunity→listing), `/outcome <id> <label> [note]` command records by external id. `CalibrationModule`
    imported into `NotificationsModule` (no cycle). tsc clean, jest 37/37.
  - [x] **E2c — passive `price_dropped`** in the poll: on a re-observed price drop, `poll.service`
    records a deduped passive `Outcome` (weak "market moved" signal); `PollingModule` imports
    `CalibrationModule`. No extra source request. tsc clean, jest 37/37.
    - [ ] **E2c-later — `disappeared` / time-on-market**: reliable only once the source distinguishes
      "listing removed" (HTTP 404) from "fell out of the search/paging". Deferred (needs a source change).
  - [ ] **E2d — realized precision** in `/report` (👍 vs 👎 over a recent window, per profile + overall).
- [x] **E3 — US2 (P2): Threshold auto-calibration** — **complete.** Per-profile propose + bounded
  apply/revert; weekly schedule; `propose` default, `CALIBRATION_MODE=auto` for hands-off; frozen on thin
  data, reversible, recorded in `calibration_runs`.
  - [x] **E3a — calibration core (propose-only)** (delegated → Sonnet): pure `proposeThreshold(input,
    target)` (freeze < 20 scores; precision rule priority; volume corridor; bounded ±`MAX_STEP` 0.1;
    "insignificant change → null") + `CalibrationRun` entity/migration (`1784302227453`) +
    `CalibrationService.proposeThresholdRun` (global scores + realized precision → persists a
    propose-mode run). Unit-tested (6 cases). No apply/scheduler/bot. tsc clean, jest 47/47.
  - Decision (operator): go **per-profile** ("повніше") — tag listings with their profile.
  - [x] **E3b-1 — `listing`→`profile` link** (mine): `Listing.profileId` (nullable) set in
    `recordEvaluation(…, profile.id)`; migration `1784303733796`; `scoresForReport(profileId?)` filters
    per profile. tsc clean, jest 47/47.
  - [x] **E3b-2 — per-profile proposals** (delegated → Sonnet): `CalibrationRun.profileId` (+ migration
    `1784304020857`); `CalibrationService.proposeAllProfiles(target)` iterates enabled profiles →
    per-profile scores + `profile.minDealScore` → `proposeThreshold` → one propose-mode run per profile;
    `globalPrecision()` helper (shared). `ProfilesModule` wired (no cycle). Global precision for now
    (per-profile precision deferred — needs outcome→opportunity join). tsc clean, jest 48/48.
  - [x] **E3b-3 — apply + bot + schedule** (E3b-3a mine, E3b-3b delegated → Sonnet):
    `CalibrationService.applyProposal`/`revert`/`runCalibration`/`runAndSummarize`; `ProfilesService.setThreshold`
    + boot no-clobber of `minDealScore` (calibration owns it after first seed); config `CALIBRATION_MODE`
    (propose|auto, default propose) + target (`CALIBRATION_MIN/MAX_VOLUME`, `MIN_PRECISION`); weekly
    `CalibrationSchedulerService` (Mon 09:30) broadcasts proposals/applied changes; bot `/calibrate`
    `/params` `/revert`. Bounded (±0.1/run), frozen on thin data, reversible. tsc clean, jest 58/58.
- [x] **E4 — US3 (P3): Weight learning** (propose-only) — **complete.** Learns the global soft-flag
  penalty from labeled outcomes → bounded, evidence-backed candidate `ParameterSet`; operator approves.
  - [x] **E4a — learning core** (delegated → Sonnet): `SOFT_FLAG_CODES` exported from `red-flags.ts`;
    pure `weight-learning.ts::proposeSoftFlagPenalty(samples, current)` — compares 👎-rate of listings
    where ≥1 soft flag fired vs none; strengthens/weakens the global soft-flag penalty (bounded ±0.05,
    clamped [0.5,1.0]), freezes < 8/group, "no signal" → null; returns evidence. Unit-tested (5 cases).
    Additive only (no consumers yet). tsc clean; new suite green in isolation (full jest blocked by a
    transient sandbox slowdown — re-run on your machine).
  - [x] **E4b — wire + approve** (delegated → Sonnet): `CalibrationService.proposeWeights` (labeled
    outcomes → opportunities' `redFlags` → soft-flag counts via `SOFT_FLAG_CODES` → `proposeSoftFlagPenalty`)
    emits a **candidate `ParameterSet`** (`ParametersService.createCandidate`); `applyLatestWeightCandidate`
    → `ParametersService.activate` (refreshes cache). Bot `/weights` (proposal + evidence) + `/weights_apply`
    (activate). Pure `formatWeights` unit-tested. tsc clean; targeted jest green (full suite pending on the
    dev machine — sandbox jest degraded).

Note: learning is scoped to **precision on the alerted set** (selection bias — we don't observe
never-alerted listings). See spec §Context.

## 🟢 Later — deferred (promote when picked up)

- [x] **B22 — Explainable "why" breakdown** (delegated → Sonnet): `/why <id>` shows the full derivation —
  fair-value basis (cohort mileage-aware? + **sample size**), **mileage correction** amount, **score
  decomposition** (`raw × confidence × penalty = score`), risks **grouped by source** (AUTO.RIA data vs
  description), and a Ukrainian verdict. `ValuationResult` now exposes `raw`/`penalty`/`disqualified`;
  `Assessment` exposes `sampleSize`/`benchmarkBase`/`mileageAware`; pure `formatWhy` + unit test. tsc
  clean, jest 50/50. (Remaining niceties: show the exact description *phrase* that fired a flag, and
  localize the `/check` `reason` string — small follow-ups; folded into B23.)
- [ ] **B23 — Persisted evaluation explanation** (so we can *argue* any decision, incl. past ones).
  Snapshot the reasoning at scoring time onto `Listing.lastExplanation` (+ copy to `Opportunity`): cohort
  {key, tier, sampleSize, mileageAware}, fair-value base/adjusted + mileage adjustment, discount, raw /
  confidence / penalty, fired flags {code, source}, **ParameterSet version + threshold used**, timestamp.
  `/why` + the alert read the snapshot (faithful, free, works even if the listing is gone) → live re-fetch
  only as fallback. Then capture matched condition **phrases** and localise the `reason`. `resolveBenchmark`
  must surface the matched cohort. Full analysis: [[explainability-gaps]].

- [~] **B21 — Real (VIN-verified) mileage vs claimed.** Rolled-back odometers make frauds look like
  jackpots (Sonata 2013, claimed 181k / real 595k → false score 1, −44.55%). API exposes only
  `checkedVin.isChecked` + `linkToReport`, **not** the real number. Full note: [[vin-real-mileage]].
  - [x] **B21a — cheap heuristics** (delegated → Sonnet): read `checkedVin.isChecked` → `risk.vinChecked`;
    pure `valuation/mileage-risk.ts` → two **soft** red-flags: `unverified_bargain` (discount ≥ 25% with no
    VIN verification — the Sonata pattern) and `suspicious_low_mileage` (< age × 5k km/yr). Wired through
    `computeValuation` + poll + `/check` + alert labels. Unit-tested. **Flags + dampens** (soft ×0.8), does
    not hard-eliminate — the real number needs B21b. tsc clean; `mileage-risk` 6/6.
  - [ ] **B21b — real figure** (deferred): a (paid) VIN-report API, or scrape the `linkToReport` page
    behind the source port — enrich *candidates only* (budget). Then the low-claimed-mileage trap can be
    hard-caught, not just flagged.

- [x] **B10 — Price-drop detection (FR-009):** after new ids, the poll re-observes up to
  `REOBSERVE_PER_CYCLE` known listings (oldest `lastSeenAt` first), budget-permitting; on a price drop
  that re-qualifies as an opportunity it sends a distinct `📉 Ціна знижена` alert (idempotent
  `price_drop` dedupKey). `ListingsService.findByExternalIds` + `NotificationsService.notifyPriceDrop`.
- [ ] **B11 — Own-statistics valuation** — mostly **obviated**: RIA `/average_price` already returns
  `interQuartileMean` + `percentiles` (robust) for free, which we now use. Only worth revisiting if we
  need stats RIA doesn't give (e.g. our own regional/trim cuts). See [[profitability-definition]].
- [ ] **B12 — Relist/duplicate heuristic** (VIN / phone-hash). FR-008.
- [x] **B13 — Durable rate budget:** Postgres-backed `rate_budget_windows` (atomic upsert per hour
  window, prunes old windows). Survives restarts + safe across instances; 429 still authoritative. Redis
  not needed. See [[0004-drop-redis-bullmq|ADR-0004]].
- [ ] **B14 — Dictionary cache** (id↔name) if a flow needs name→id resolution. (T017)
- [x] **B15 — Integration test — scoring pipeline** (`test/integration/scoring-pipeline.spec.ts`): composes
  the **real** `resolveBenchmark` + `MileageAdjuster` + `ValuationService` (v1 seed) against a fake source
  (fake benchmark cache passes the loader through) — deterministic, no DB. 6 cases: clean below-market →
  opportunity; overpriced → no; damaged → disqualified; thin cohort → no (insufficient data); unverified
  bargain → flag + dampened; suspiciously-low mileage → flag. Guards "don't lose deals / don't spam". tsc
  clean; logic hand-verified (full jest run pending on the dev machine — sandbox jest degraded). A
  full DB-harness `poll()` test (subscribers→notifier fan-out) remains a later add.
- [ ] **B16 — Operator alerting** on budget exhaustion / source down (dead-man's-switch). (FR-012 / T038)
- [ ] **B17 — Scale:** paid API tier / wider coverage; explore [[alternative-sources]] if the API
  stays too limiting.

## Related
- [[00-INDEX]] · [[goals]] · [[monitoring-approaches]] · [[profitability-definition]]
