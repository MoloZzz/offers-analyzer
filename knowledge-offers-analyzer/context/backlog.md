---
title: Backlog — living execution queue
type: context
updated: 2026-07-22
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

## 🔴 Epic — Оцінка вигідності v2: калібрування, лайфсайкл, гроші (2026-07-22)

Operator backlog, doubling as an addendum to [[0006-operator-profit-vision|ADR-0006]] + spec 002
(auto-tuning) + spec 003 (composite score). API plan changed to **20,000 req/mo** (≈27.4/hr
average — ceiling unchanged vs the old ~30/hr, only the shape did: hourly window → monthly pool).
See [[0009-monthly-rate-limit-pool|ADR-0009]].

**Central hypothesis (SPEC-004):** `fair_value` (RIA `average_price` interQuartileMean) is measured
over **active** listings only — length-biased sampling. A fairly-priced car sells in ~3 weeks and
leaves the sample; an overpriced one sits 3–4 months and stays in it, so overpriced listings are
structurally over-represented. Expected effect: `fair_value` inflated 8–15%, so the current 0.63
threshold (≈19% nominal discount) is really only ~6–10% off actual realized price — margin-negative
after haggling and paperwork. This is the leading explanation for the "deals" not panning out.

- [ ] **FIX-003.1 — Verify `factorBounds` are live in prod.** P0, ~15 min. Code review found
  `factorBounds: {}` in the seed — if so, `score === priceCore` and all of spec 003's liquidity/
  repair-risk factors have **silently** zero effect, contradicting the "implemented" status in
  `specs/README.md`. Check the active `ParameterSet` in prod; fill or explicitly document as
  disabled; add a startup warning if a factor is coded as shipped but its bounds are empty.

- [ ] **SPEC-004 — Realized-price calibration (survivorship correction).** P0, 0 API cost (reuses
  the id-list search already made every cycle — a diff against the previous list detects
  disappearances for free, no extra request).
  - US4.1 — track disappearances: new `listing_disappearance` table
    (`listing_id, cohort_key, last_known_price_usd, first_seen_at, disappeared_at, dom_days,
    price_cuts_count, had_price_cut`), populated from the existing `price_history` (no new request).
  - US4.2 — filter non-sales: disappearance ≠ sale (could be delisted/expired/banned). Use
    `dom_days < 60`; detect relists (same VIN, or make+model+year+mileage±2k+city match within 30
    days) → `is_relist = true`, excluded from calibration.
  - US4.3 — compute `k` per cohort: `k = median(last_known_price_usd of filtered disappearances) /
    median(cohort_average on the disappearance date)`. Needs ≥30 events/cohort, else fallback
    make+model → make → global (start 0.90). Recompute weekly.
  - US4.4 — apply: `X = RIA_average × k`, `discount = (X − asking) / X`; `k` lives in
    `ParameterSet` ([[0005-versioned-parameter-sets|ADR-0005]]), versioned/rollbackable; `/why`
    shows the applied `k`, its source tier, and the event count behind it.
  - Acceptance: id-diff adds zero API requests (verify via the request counter); ≥30 disappearance
    events for at least one active cohort after 3 weeks; measured `k` recorded in the vault —
    expect 0.85–0.95; **if `k` ≥ 0.97 the survivorship hypothesis is falsified** and the cause is
    elsewhere (cohort composition, mileage correction).
  - No dependencies — start first; every day of delay pushes back everything downstream.

- [ ] **SPEC-007 — Outcome labels beyond 👍/👎.** P0 (the change is trivial; data accrual is not).
  Problem: spec 002's auto-tuning ([[E3|backlog]]) optimizes precision on 👍/👎, but 👍 means "looks
  like a good alert," not "made money" — the operator thumbs-up cheap listings, which converges the
  system toward "looks cheap," exactly the population of wrecked/scammy/problem cars. Better
  auto-tuning on this label makes the *product* worse.
  - US7.1 — post-deal outcome form: `bought`, `buy_price_usd`, `actual_costs_usd` (repair +
    paperwork), `sold`, `sell_price_usd`, `days_on_market`, `decline_reason` (enum: condition,
    documents, seller, price, other — cheap to capture, shows flags the system misses but a
    physical inspection catches).
  - US7.2 — compute realized margin = `sell_price − buy_price − actual_costs` + realized DOM.
  - US7.3 — re-target spec 002's auto-tuning metric to `median(realized margin)` among purchases +
    share of loss-making deals, not 👍-precision.
  - US7.4 — calibration check: `Z_forecast` vs `Z_actual` (once [[SPEC-006]] ships) on closed deals;
    systematic bias corrects `k`, `torg`, `C_rec`.
  - Acceptance: one-click outcome form from the alert; fields optional, reminder after N days;
    spec 002's threshold auto-tuning **does not move** the threshold until ≥15 closed deals
    accumulate; a report of `Z_forecast` vs `Z_actual` with MAE and systematic bias.
  - **Blocks CHANGE-002.1** — implement before auto-tuning is allowed to actually move the
    threshold on live data.

- [ ] **SPEC-005 — Listing lifecycle + tiered re-check.** P1, ~4,300 req/mo (funded by
  [[0009-monthly-rate-limit-pool|ADR-0009]]). Problem: a listing is scored once, at ingest, and
  the system never revisits it (aside from the existing ad-hoc re-observe in B10). But a motivated
  seller rarely lists at 60% of market on day one — they list near market and cut price 3–5 weeks
  later, once or twice. The deal this whole system exists to catch **does not exist at ingest
  time** — it appears later. This is a logic gap, not a budget optimization: looking at a listing
  once structurally cannot see its price dynamics.
  - US5.1 — tiered re-check scheduler: tier 1 (score within 10% of the profile threshold, i.e.
    already in `/report`) → every 2 days; tier 2 (10–25% from threshold) → weekly; tier 3 (beyond
    25%) → every 2 weeks or never. Tier recomputed after every re-check; disappeared listings drop
    out.
  - US5.2 — behavior-based escalation: `DOM > 45` **or** `price_cuts_count ≥ 1` → bump a tier —
    a listing that just cut price is the highest-value thing to watch, since that's exactly where
    it crosses the threshold.
  - US5.3 — any detected price change triggers a full re-score; alert idempotency is **relaxed**:
    a repeat alert on the same `listing_id` is allowed if price dropped ≥5% from the price at the
    last alert (or there was no prior alert).
  - US5.4 — feed `price_cuts_count` / cut depth into spec 003 US3 (seller motivation) — a
    measurable urgency signal, unlike description keywords a seller can always type.
  - Acceptance: scheduler stays within its tier quota; tier-1 price cuts detected within ≤2 days;
    re-score fires automatically on price change; repeat-alert-after-≥5%-cut works without
    duplicating; target ≥30% of alerts originating from re-check (not ingest) within 2 months.
  - Depends on [[0009-monthly-rate-limit-pool|ADR-0009]].

- [ ] **SPEC-008 — Cohort market drift.** P2, ~50 req/mo. Problem: buy today, sell in 5–7 weeks; a
  cohort dropping 1.5%/mo erodes a listing that's 15% below market today to ~12% by sale time —
  on a $2,000 margin that's a $250–300 miss, bigger than the whole liquidity correction. Currently
  not modeled at all.
  - US8.1 — monthly job pulls the annual average-price series (`/auto/statistic-avarage-price/`,
    one request returns the full year) for the top ~50 cohorts by activity — 50 req/mo total.
  - US8.2 — store `cohort_drift` with computation date; fallback to parent cohort, then global.
  - US8.3 — apply: `drift_mo = (avg[last mo] / avg[3 mo ago])^(1/3) − 1`,
    `X = RIA_average × k × (1 + drift_mo × 1.5)` (1.5 mo = expected horizon to sale — swap for
    [[SPEC-006]]'s liquidity-tier `DOM_expected` once that exists); show in `/why`.
  - US8.4 — flag a cohort dropping >4%/mo as "market falling" in the alert.
  - Acceptance: job stays within 50–100 req/mo; `drift` visible in `/why`; clamp ±5%/mo so a data
    artifact can't wreck the estimate.

- [ ] **SPEC-006 — Money output (Z), not just a score.** P2. Problem: the 0–100 score is
  dimensionless; liquidity and repair-risk are genuinely *monetary* quantities (cost of capital
  tied up, expected repair spend) currently expressed as multipliers of the wrong dimension — e.g.
  a liquidity multiplier of ±10% on a $2,000 expected profit spans ±$200, when the real holding-
  cost gap between a 25-day tier and a 120-day tier is ~$650 on a $10k car and doesn't scale with
  price at all (same $30k car: real gap ~$1,950, multiplier still ×0.9). Same issue for repair
  risk: `DSG → ×0.85` is really `p(failure) × cost ≈ 0.22 × $1,500 = $330` — a checkable number;
  `×0.85` is not.
  - Does not replace the score (kept for gating/sorting); computes and shows `Z` alongside:
    `X = RIA_average × k × (1 + drift × 1.5)` (SPEC-004 `k`, SPEC-008 `drift`),
    `B = asking × (1 − torg)` (`torg`: DOM<30→0.03, 30–90→0.05, >90→0.08, +0.02 per recorded cut),
    `C_fix` = paperwork/inspection/fees (`ParameterSet` constant),
    `C_rec` = Σ E[cost] per red-flag (starter table: repair-needed desc $800, engine/gearbox issue
    $1,500, DSG/CVT+150k km $400, air suspension $350, aged turbodiesel $600, aged hybrid battery
    $900, no VIN report $180, post-accident $2,500 — each with a σ for later Monte Carlo),
    `C_hold = B × r × DOM_expected / 365` (`DOM_expected` from the liquidity tier: A=25, B=45,
    C=70, D=120 days), `Z = X × 0.92 − B − C_fix − C_rec − C_hold`, `ROI = Z / (B + C_fix + C_rec)`.
    Hard disqualifiers stay boolean (salvage, seized, under lien) — everything else becomes money.
  - Acceptance: alert shows `Z` ($) and `ROI` (%); `/why` breaks `Z` into components; score/gate
    unchanged (no regression); after a month of parallel operation, compare which correlates better
    with real operator deals — record the verdict as input to a possible gate switch.
  - Depends on SPEC-004 (`k`), SPEC-007 (calibration data), SPEC-008 (`drift`).

- [ ] **CHANGE-003.2 — US3 seller-motivation: add behavioral signals.** Add `price_cuts_count`,
  cumulative cut depth, and `DOM` (from SPEC-005) alongside the already-planned keyword/seller-type
  signals — behavioral signals outrank text keywords a seller can always type, regardless of intent.

- [ ] **CHANGE-003.3 — Segment mileage norms: use cohort median, not `age × 15k`.** Refinement to
  the already-planned per-segment table: base it on the **cohort's median mileage** (already
  reflects typical use for that segment) instead of an absolute `age × annualK` norm, which
  systematically misjudges atypical-mileage segments (commercial diesels ~25k km/yr, city
  hatchbacks ~8k km/yr) — this removes the need for a separate per-segment norm table. Also:
  the current ±20% cap saturates at ~100k km of deviation (2% per 10k km); for 10+ year-old cars
  that's normal variance, so the correction degenerates into a constant. Consider a logarithmic
  mileage curve instead of the linear+cap shape.

- [ ] **CHANGE-002.1 — Re-target spec 002 auto-tuning to realized margin.** See US7.3. Blocked by
  SPEC-007.

### What NOT to do (checked and rejected)
- **Don't swap IQM for median.** Interquartile mean is already outlier-robust; outliers aren't
  the problem here — survivorship (SPEC-004) is.
- **Don't build a daily full-market panel.** Not feasible at 20,000 req/mo. The tiered re-check
  (SPEC-005) gives the same signal within budget.
- **Don't auto-disqualify uncustomed/credit-lien cars.** With a human operator in the loop these
  are a separate queue with a computed paperwork cost, not a hard stop — revisit once SPEC-007
  data exists.
- **Don't manually raise the threshold to fight false alerts.** The current 0.63 is probably
  already hand-tuned to compensate for the survivorship bias. Fix SPEC-004 first, then revisit
  the threshold.

### Execution order

| # | Item | Blocks | API cost |
|---|---|---|---|
| 1 | FIX-003.1 | — | 0 |
| 2 | SPEC-004 (US4.1–4.2, data collection) | SPEC-006, threshold review | 0 |
| 3 | SPEC-007 (US7.1–7.2, fields) | CHANGE-002.1, SPEC-006 | 0 |
| 4 | ADR-0009 | SPEC-005 | 0 |
| 5 | SPEC-005 | CHANGE-003.2 | ~4,300/mo |
| 6 | SPEC-004 (US4.3–4.4, apply `k`) | — | 0 |
| 7 | SPEC-008 | — | ~50/mo |
| 8 | SPEC-006 | — | 0 |
| 9 | CHANGE-003.2, CHANGE-003.3 | — | 0 |
| 10 | CHANGE-002.1 | — | 0 |

The first four cost zero requests and accumulate the data everything else needs — delaying them
delays the rest by the same amount.

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
  «не бита», «після капремонту» do not fire. Positives did not inflate the score as built
  (that rule is since superseded by ADR-0006 §4 → spec 003 US4). Unit-tested
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

## 🟠 Epic — Composite Total Deal Score (spec 003, ADR-0006) — the new product vector

Vision reframed 2026-07-18 ([[0006-operator-profit-vision|ADR-0006]]): rank by **probability of
operator profit on resale**, not just discount. Full plan: `specs/003-composite-deal-score/`
(spec + plan + tasks). Operator's P0–P15 proposal mapped against reality:

| Operator item | Status |
|---|---|
| P0 vision, P11 profitability def, P12 not-an-appraiser, P15 operator-thinking | ✅ ADR-0006 + constitution v1.1.0 + vault sweep (this task) |
| P1 composite score model, P13 score explanation 0–100 | Spec 003 Phase F (price core stays dominant; extends `/why`/B22, couples with B23) |
| P2 liquidity score | Spec 003 US1 (new) |
| P5+P8 risk / repair-cost heuristics | Spec 003 US2 (merged — model-level risk; listing-level red-flags already exist) |
| P3 negotiation score, P4 seller score | Spec 003 US3 (dealer *policy* already exists; this adds score shading) |
| P7 positive signals **raise** score | Spec 003 US4 (absorbs B24; supersedes its "never inflate" clause per ADR-0006 §4) |
| P6 mileage correction by segment | Spec 003 US5 (replaces flat `age × 15k` in M2 + B21a) |
| P9 time on market, P10 market demand, generation liquidity, confidence tuning | Should-Have — B25 (+ demand once snapshot history suffices); **not** in spec 003 v1 |
| P14 no ML now | ✅ already the standing verdict ([[profitability-methods-coverage]] §5) |
| Already built (from the proposal's Must-Have): condition score (C1–C3), risk red-flags, score explanation (`/why`), auto threshold calibration (E3) | ✅ pre-existing — extend, don't rebuild |

- [x] **S-F — Phase F: composite skeleton + 0–100 presentation** (blocking; behavior-identical
  with neutral modifiers — SC-001). **Done** (T001–T003): `valuation/factors/factor.ts`
  (`composeFactors` — dampeners full, combined uplift clamped to `upliftCap`; `toTotal100`/
  `toSubScore100`); `ValuationResult` += `priceCore`/`factors[]`/`total100`; `ScoringParams` += optional
  neutral factor config (no migration); `📊 Загальний бал N/100` in `/why` + alerts. tsc clean,
  `factor.spec` 7/7; SC-001 holds by construction. **T004 loader + T005/B23 persist deferred** (nothing
  to load/persist until a factor ships) — B23 no longer *blocks* Phase F, it lands with the first factor.
- [x] **S1 — Liquidity score** — done: `config/heuristics/liquidity-tiers.json` + pure
  `factors/liquidity.ts` (tier A–D → modifier within ParameterSet bounds; unlisted→neutral-with-reason),
  gated by `factorBounds.liquidity` + table. `liquidity.spec` 7/7.
- [x] **S2 — Repair-risk score** — done: `config/heuristics/repair-risk.json` (model/make tiers +
  gearbox/engine/fuel/age patterns) + pure `factors/repair-risk.ts` (HIGH→dampen, LOW→slight uplift);
  `/info` gearbox/fuel/engine verified + mapped in `AutoRiaSource`; wired through poll + query.
  `repair-risk.spec` 10/10. Both factors ship **off by default** (neutral seed → SC-001); enable via a
  `ParameterSet` carrying `PHASE1_FACTOR_BOUNDS`, then re-validate thresholds (S6).
- [ ] **S3 — Seller-motivation + seller-type** (lexicon + modifier; P2).
- [ ] **S4 — Positive signals uplift** (absorbs B24; P2).
- [ ] **S5 — Segment mileage norms** (P2).
- [ ] **S6 — Rollout: threshold re-validation + precision check** (after S1/S2 and S4).

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
- [x] **B12 — Relist de-dup** (delegated → Sonnet) — definition in [[when-to-alert]]. Alert only when it's
  a deal **and** new info about that car: identity = **VIN** (`normalizeVin`), track `alerted_cars`
  {carKey → lowest alerted USD}; pure `decideRelistAlert(lowest, asking)` → `first` | `cheaper` |
  `suppress`; poll gate in `evaluateAndNotify` (after `isOpportunity`) suppresses a re-listed car unless
  it's now **cheaper than the lowest we ever alerted** (USD compare). No VIN → behaves as before. New
  entity + migration `1784402208608`. Unit-tested. tsc clean; `relist-dedup` 7/7.
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
- [x] **B16 — Operator alerting (dead-man's-switch)** (delegated → Sonnet): new `HealthModule`/`HealthService`
  (shared singleton) tracks the last successful poll cycle; `PollService.poll` wraps `runCycle` and marks
  **success/failure** (budget exhaustion is normal → still success; an unexpected throw = failure).
  `HealthMonitorService` (`@Cron */15`) uses pure `decideHealthAlert` (edge-triggered: alert once when
  stale > 45 min, once on recovery) and `NotificationsService.broadcast`s to the operator. Unit-tested
  (`health-alert.spec`). Directly serves "don't sit blind if polling silently broke". tsc clean.
- [ ] **B17 — Scale:** paid API tier / wider coverage; explore [[alternative-sources]] if the API
  stays too limiting.
- [~] **B24 — Positive description signals** — **absorbed into spec 003 US4** (2026-07-18).
  Scope upgraded per [[0006-operator-profit-vision|ADR-0006]] §4: positives now apply a **bounded
  uplift** (the original "never inflate, rank/annotate only" clause is superseded) *and* reduce the
  `unverified_bargain` dampening; price dominance + anti-gaming invariants keep the anchor safe.
  Track in `specs/003-composite-deal-score/tasks.md` (T030–T031).
- [ ] **B25 — Time-on-market & price-history as a scoring factor.** We already store `PriceObservation`
  and re-observe drops but **don't score** age/markdown-count. Turn days-seen + number/size of drops
  into a bounded score modifier + alert annotation (motivated seller ↑; long-stale ↓, hidden-problem
  hint). Needs the "removed vs fell-out-of-paging" distinction (couples with E2c-later). **Priority
  raised** by ADR-0006 (Should-Have, first follow-up after spec 003; a **market-demand score** — segment
  turnover speed, distinct from liquidity — joins here once snapshot history suffices). See
  [[profitability-methods-coverage]].
- **ML (expected-price model) — deliberately deferred, not backlogged as actionable.** Verdict + trigger
  conditions in [[profitability-methods-coverage]] §5: no sold-price ground truth, data-starved (~30
  req/hr), strong free IQM baseline, explainability cost. Revisit only once we have outcome labels at
  volume + a feature-rich stored dataset + measured evidence the rule-based baseline is losing deals.

## Related
- [[00-INDEX]] · [[goals]] · [[monitoring-approaches]] · [[profitability-definition]]
- [[0009-monthly-rate-limit-pool|ADR-0009]] · [[0006-operator-profit-vision|ADR-0006]] · [[0005-versioned-parameter-sets|ADR-0005]]
