# Research: Defensible valuation evidence

## Decision summary

The immediate product problem is not merely a wrong median. The legacy production flow deliberately
uses a broad make/model/year cohort, discards its mileage band for cache/budget reasons, applies a
claimed-mileage adjustment, and reaches full confidence with 20 samples. This can mechanically
produce a high score while the provider's current active-market view is much lower.

SPEC-015 therefore instruments and evaluates a separate provider-backed active-market estimate in
shadow. It does not claim that active ads equal a completed resale price.

## Evidence from the Audi incident

The reviewed listing was a 2004 Audi A6 Allroad with an asking price of $5,000. Its stored
explanation used a $6,500 legacy base, 23 samples, a +$325 mileage adjustment, and reached $6,825,
which yielded the reported 26.74% discount. The listing had age, mileage, condition, and fitment
details that the broad legacy cohort did not preserve as comparison dimensions.

The public AUTO.RIA page showed a $5,000 market display and $4,882-$5,395 range at the captured
time. This is a diagnostic observation, not a completed-sale label and not a permanent hard-coded
answer.

## Source decisions

| Topic | Decision | Rationale |
|---|---|---|
| New provider | Use AUTO.RIA's official paid AI valuation API in shadow | It supports listing-ID and richer vehicle inputs and returns provider statistics/similar-car evidence. |
| Legacy endpoint | Keep as legacy score baseline only; do not use as an AI failure fallback | AUTO.RIA documents the older average/median interface as unsupported/scheduled for closure, and silent fallback reproduces the current ambiguity. |
| Query strategy | Prefer omniId/listing ID; attribute mode requires policy-required facts including mileage | A listing-ID lookup is closest to the specific listing. Attribute mode without mileage risks the provider's broad default range. |
| Target label | active_listing_ask only | Provider/public estimates reflect market-position evidence, not independently verified completed sales. |
| Rollout | Disabled by default; deterministic low-volume shadow and manual checks | Protects operational budget, verifies source parity, and preserves all live behavior. |
| Historical proof | Persist normalized/redacted evidence, not raw responses | Enables /why and audits while minimizing privacy, retention, and contract risk. |

## External source references

- [AUTO.RIA AI valuation API](https://docs-developers.ria.com/en/used-cars/average_price/auto_ria_average_price_ai) - documented paid POST endpoint, authorization requirements, listing-ID and richer-attribute input modes.
- [AUTO.RIA legacy median/average endpoint](https://docs-developers.ria.com/en/used-cars/average_price/median_average_price) - documented as unsupported/scheduled for closure.
- [AUTO.RIA public price calculator](https://auto.ria.com/uk/price/average/) - public market estimate presentation based on advertisement pricing, useful for manually captured parity diagnostics.
- [Ukraine vehicle valuation methodology](https://zakon.rada.gov.ua/laws/show/z1074-03) - comparable valuation practice considers mileage, equipment, condition, region, and repairs; it distinguishes normal and forced values.
- [MIA vehicle turnover open data](https://data.gov.ua/dataset/06779371-308f-42d7-895e-5a39833375f0) - indicates turnover but does not supply sale prices, so it cannot validate transaction price.

## Rejected alternatives

### Treat the legacy cohort as a resale model

Rejected. It lacks several material identity/condition dimensions, makes a generic analytical mileage
correction, and observes active inventory rather than transactions. It remains a legacy score input
until separately revalidated; it cannot be relabelled as a resale model.

### Scrape the public calculator or other boards

Rejected. The repository's official-source policy forbids scraping. Public calculator observations
may be manually captured for a small parity corpus only if permitted; they are not an automated
source.

### Infer a sale price from listing disappearance

Rejected. SPEC-004 states that disappearance can be delisting, expiration, or relisting. It is a
candidate survivorship signal, not a confirmed transaction price.

### Substitute our own average from provider similarCars

Rejected. The provider's canonical statistic is the source estimate. Deriving a new estimator from
partial comparables would be an unvalidated local model and needs a later specification.

### Automatically replace alerts with the provider number

Rejected. The operator needs a source-parity, budget, coverage, and outcome-validation report first.
ADR-0011 requires evidence and approval before a scoring transition.

## Open implementation gates

These are readiness gates for implementation/deployment, not ambiguities in the product spec:

1. Verify the paid API's exact response schema, allowed request fields, attribution, storage, and
   retention terms with approved non-production credentials; pin it in a fixture before enabling.
2. Record the effective per-call/month entitlement. Provider allocation must be configured rather
   than assuming the legacy 20,000-call pool applies.
3. Pre-register the gold-case corpus and public-calculator capture method/tolerance. An unexplained
   API/UI mismatch blocks activation, not shadow collection.
4. Retain only provider-approved normalized comparable fields and hashes. Do not persist raw
   personal advertiser data, API keys, VIN, or plate data in explanation/log output.
5. Do not define an accuracy target against transaction price until closed operator outcomes exist.
   Initial success is evidence completeness, conservative review, source parity, and budget safety.

## Future value chain

    provider active-market evidence
      -> locally calibrated normal-time sale estimate
      -> quick-exit estimate with horizon and probability
      -> safe buy ceiling after costs, reserve, and required margin

Only the first line is within SPEC-015. The remaining lines require confirmed outcomes from SPEC-007,
survivorship/selection work from SPEC-004, and a separate evidence-gated activation decision.

