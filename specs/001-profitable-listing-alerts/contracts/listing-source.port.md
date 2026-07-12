# Contract — `ListingSource` port (internal)

The abstraction every listing source implements (AUTO.RIA first). Keeps the core independent of
any single site (Principle IV). Shapes are conceptual, not final TypeScript.

## Interface

```text
interface ListingSource {
  key: string; // "auto-ria"

  // Return ids of listings matching a profile's filters (paged).
  search(query: SourceSearchQuery): Promise<{ ids: string[]; nextPage?: string }>;

  // Full detail for one listing.
  fetch(externalId: string): Promise<ListingDetail>;

  // Fair-value benchmark for a cohort (avg price + sample size).
  averagePrice(cohort: CohortQuery): Promise<{ value: Money; sampleSize: number }>;

  // Low-churn reference data (cached; does not spend live budget).
  dictionaries(): Promise<SourceDictionaries>;
}
```

## Types (conceptual)

- **SourceSearchQuery**: categoryId, stateId?, cityId?, makeModelPairs[], yearRange?, priceRange?,
  mileageRange?, page?.
- **ListingDetail**: externalId, make, model, year, mileage?, stateId?, cityId?, sellerType, vin?,
  url, price: Money, raw (source-specific extras, e.g. VIN-report link).
- **CohortQuery**: make, model, year, region, mileageBand, options?.
- **Money**: { amount: number, currency: "USD" | "UAH" }.

## Guarantees / rules

- Every call goes through the rate budget; adapters MUST NOT bypass it.
- `search` is the cheap wide call; `fetch` is spent only on **new** ids; `averagePrice` results are
  cacheable per cohort/day.
- Adapters normalize source fields to the shapes above; source-specific quirks stay inside the adapter.

## Related ports

- **Notifier**: `send(subscriber, message): Promise<void>` — Telegram adapter.
- **ExchangeRate**: `rate(from, to, at?): Promise<number>` — NBU adapter.
