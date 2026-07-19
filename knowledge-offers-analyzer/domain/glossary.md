---
title: Domain glossary
type: domain
updated: 2026-07-19
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
| **Total Deal Score** | The composite ranking signal: price core (`raw × confidence × penalty`, dominant) × bounded factor modifiers (liquidity, repair-risk, negotiation, seller, positives). Shown to the operator as 0–100 + per-factor reasons. Spec `003-composite-deal-score`; factors neutral until implemented. | Supersedes "Opportunity score = discount × confidence". |
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

## Business rules

_Draft — confirm during SDD:_
- A listing becomes an **Opportunity** only when discount ≥ threshold **and** confidence is sufficient **and** no disqualifying red-flag. See [[profitability-definition]].
- Compare within the same **region/currency**; normalize UAH/USD via a stored FX rate.
- Capture new rules here as decided; link contentious ones to an ADR in [[decisions/README]].

## Related

- [[00-INDEX]]
- [[overview]]
