---
title: Domain glossary
type: domain
updated: 2026-07-23
---

# Domain glossary (ubiquitous language)

> The shared vocabulary of the offers domain. Use these exact terms in code, specs, and conversation. Add a term the first time it appears.

| Term | Definition | Notes / synonyms to avoid |
|------|------------|---------------------------|
| **Listing** | A single car advertisement on a source (auto.ria `auto_id` + details). | Prefer over "offer" for a raw ad. |
| **Cohort** | The set of comparable cars used to value a listing. Tried most-specific → widest until usable: **make+model+year±1+mileage±25k km** (like-for-like), then year±1 nationwide, then make+model. City is never used (starves the sample). See [[why-no-opportunities]]. | — |
| **Newest by market** | An ingestion mode: a search profile with **empty make/model** + region + price cap that pulls the freshest listings market-wide, using AUTO.RIA's `top` **submission-period** filter (1=last hour, 2=today, 8=last 3h…). Each is still valued against its own cohort. | Not an `order_by` sort — RIA has no "newest" sort. |
| **Fair value (FV)** | Estimated market price for a listing's cohort; v1 anchored on RIA average price. | See [[profitability-definition]]. |
| **Discount** | `(FV − asking) / FV` — how far below market a listing is priced. | — |
| **Opportunity** | A listing flagged as having a **high probability of operator profit on resale** ([[0006-operator-profit-vision\|ADR-0006]]): strong price core (discount + confidence + red-flags) shaped by the factor modifiers below. | Not a guarantee of profit. |
| **Total Deal Score** | The composite ranking signal: price core (`raw × confidence × penalty`, dominant) × bounded factor modifiers (liquidity, repair-risk, negotiation, seller, positives). Shown to the operator as 0–100 + per-factor reasons. Spec `003-composite-deal-score`; liquidity + repair-risk are implemented but **inactive pending ParameterSet activation** (active prod ParameterSet has empty `factorBounds` — verified 2026-07-23, see [[backlog#FIX-003.1]]). | Supersedes "Opportunity score = discount × confidence". |
| **Liquidity score** | How easily a model resells (heuristic tiers by make/model/segment: Camry/Octavia high; XF/C6 low). Bounded modifier + reasons. | ≠ market demand (segment turnover speed — later). |
| **Repair-risk score** | Model-level expected-repair-cost heuristic (DSG/CVT/air suspension/aged premium diesels → HIGH; Corolla/Camry → LOW). Distinct from listing-level red-flags. | Bounded dampening, never a hard disqualifier by itself. |
| **Negotiation signal** | Seller-motivation cue parsed from the description («торг», «терміново», «переїзд»…), negation-aware. Bounded uplift. | — |
| **Positive signal** | Concrete quality evidence in the description (1 owner, service book, 2 keys, garage kept, factory LPG…). Bounded uplift + reduces `unverified_bargain` dampening (ADR-0006 §4 — supersedes "positives never inflate"). | Promotional fluff never fires (anti-gaming). |
| **Red-flag** | A risk condition that disqualifies/penalizes a cheap listing (damaged, unclear customs, scam-cheap, etc.). Sources: AUTO.RIA `autoInfoBar` flags **and** condition signals parsed from the seller description (after-accident, non-runner, needs-repair — negation-aware). | — |
| **Search profile** | A configured niche to monitor within the API budget. | — |
| **Source adapter** | Implementation of the `ListingSource` port for one site (auto.ria = first). | — |
| **Outcome** | The realized result of a flagged listing — `manual` (operator 👍/👎, bought/skipped/resold) or `passive` (price_dropped, disappeared). The ground truth for spec-002 precision + learning. Manual is idempotent per opportunity; passive is deduped per (listing, label). | Weak passive signals ≠ confirmed profit. |
| **CalibrationRun** | A recorded threshold-calibration pass — inputs (per-profile scores, precision), the bounded proposal, whether it was applied, and why. Propose-only in v1. See spec 002. | Audit + revert trail. |
| **ParameterSet** | A versioned, active bundle of scoring tunables (`scale`, soft-flag penalty, mileage factors) that live scoring reads at runtime — replaces hard-coded constants; enables tuning + rollback. One active version at a time. See [[0005-versioned-parameter-sets\|ADR-0005]]. | Not the per-profile `minDealScore` (that's profile config). |
| **Survivorship correction (`k`)** | Empirical coefficient correcting `fair_value` for length-biased sampling: RIA's `average_price` is measured over *active* (unsold) listings, so overpriced cars — which sit far longer — are over-represented and inflate the average. `k = median(realized/last-known price of disappeared listings) / median(cohort average on disappearance date)`; computed per cohort with fallback to parent cohort → global. Spec `004-realized-price-calibration` (data collection US4.1–4.2 implemented 2026-07-23; compute/apply pending). | Hypothesis, not yet measured in prod; expected 0.85–0.95; `k ≥ 0.97` falsifies it. |
| **Disappearance** | A listing that stopped appearing in *detection-eligible* searches (no `submittedWithin` window, untruncated result, profile still covers it) for > 24h grace — recorded once per listing as a `ListingDisappearance` event (cohort key, last known USD price, DOM, price-cut stats) and treated as a *candidate* sale for `k`. Reappearance resurrects the listing and voids the event. Spec 004. | Disappearance ≠ sale — could be delisted/expired/banned; the `dom_days < 60` + relist filters select plausible sales. |
| **Relist** | The same car re-posted under a new listing id — detected on ingest against recent (≤30 days) disappearances by normalized-VIN equality, or markId+modelId+year+city with mileage within ±2k km. Marks the old event `is_relist = true`, excluding it from calibration (the car didn't sell). Spec 004 US4.2. | Related but distinct: **AlertedCar** relist de-dup (B12) governs *alerting*, not calibration. |
| **Days on Market (DOM)** | Days a listing has been continuously active since first seen. Drives re-check tier escalation and the `torg`/holding-cost estimate. | Distinct from `dom_days` used specifically in disappearance/calibration records (SPEC-004), which is DOM *at disappearance*. |
| **Re-check tier (ярус)** | A listing's re-check frequency bucket, based on how close its score is to the profile threshold (tier 1: within 10%, re-checked every 2 days; tier 2: 10–25%, weekly; tier 3: beyond, every 2 weeks or never). Escalates on `DOM > 45` or any recorded price cut. See backlog SPEC-005. | Recomputed after every re-check; not the same as `ParameterSet` version. |
| **Cohort drift** | Month-over-month change in a cohort's average price (`drift_mo`), applied to `fair_value` to project it forward to the expected sale date instead of using today's snapshot. Computed monthly from RIA's annual average-price series, clamped ±5%/mo. See backlog SPEC-008. | Distinct from the "newest by market" ingestion mode. |
| **Z / ROI** | Proposed monetary output (backlog SPEC-006) alongside the 0–100 score: `Z` = projected profit in dollars (`X × 0.92 − B − C_fix − C_rec − C_hold`), `ROI = Z / (B + C_fix + C_rec)`. Turns the liquidity and repair-risk *multipliers* into dollar terms (holding cost, expected repair spend) instead of dimensionless factors. | Does not replace the score/gate — computed in parallel; adoption decision deferred to after a month of side-by-side comparison. |

## Business rules

_Draft — confirm during SDD:_
- A listing becomes an **Opportunity** only when discount ≥ threshold **and** confidence is sufficient **and** no disqualifying red-flag. See [[profitability-definition]].
- Compare within the same **region/currency**; normalize UAH/USD via a stored FX rate.
- Capture new rules here as decided; link contentious ones to an ADR in [[decisions/README]].

## Related

- [[00-INDEX]]
- [[overview]]
