---
title: Domain glossary
type: domain
updated: 2026-07-12
---

# Domain glossary (ubiquitous language)

> The shared vocabulary of the offers domain. Use these exact terms in code, specs, and conversation. Add a term the first time it appears.

| Term | Definition | Notes / synonyms to avoid |
|------|------------|---------------------------|
| **Listing** | A single car advertisement on a source (auto.ria `auto_id` + details). | Prefer over "offer" for a raw ad. |
| **Cohort** | The set of comparable cars used to value a listing (make, model, year, region, mileage band, options). | — |
| **Fair value (FV)** | Estimated market price for a listing's cohort; v1 anchored on RIA average price. | See [[profitability-definition]]. |
| **Discount** | `(FV − asking) / FV` — how far below market a listing is priced. | — |
| **Opportunity** | A listing flagged as a candidate deal: sufficient discount + confidence, passes red-flags. | Not a guarantee of profit. |
| **Opportunity score** | Ranking signal for candidates (v1: `discount × confidence`). | — |
| **Red-flag** | A risk condition that disqualifies/penalizes a cheap listing (damaged, unclear customs, scam-cheap, etc.). | — |
| **Search profile** | A configured niche to monitor within the API budget. | — |
| **Source adapter** | Implementation of the `ListingSource` port for one site (auto.ria = first). | — |

## Business rules

_Draft — confirm during SDD:_
- A listing becomes an **Opportunity** only when discount ≥ threshold **and** confidence is sufficient **and** no disqualifying red-flag. See [[profitability-definition]].
- Compare within the same **region/currency**; normalize UAH/USD via a stored FX rate.
- Capture new rules here as decided; link contentious ones to an ADR in [[decisions/README]].

## Related

- [[00-INDEX]]
- [[overview]]
