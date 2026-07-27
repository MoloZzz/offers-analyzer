# Data Model: Budget Observability

## BudgetActivity

| Field | Meaning |
|---|---|
| sourceKey / monthKey | Source and UTC billing month |
| operation | `search`, `new_listing_detail`, `recheck_detail`, `sweep`, `cohort_average`, or `on_demand` |
| priorityTier | ADR-0009 tier 1-5 |
| profileId / profileName | Optional profile attribution; null means shared/on-demand |
| cost | Requested budget units |
| outcome | `allowed` or `denied` |
| reason | `allowed`, `tier_cutoff`, `daily_exhausted`, `monthly_exhausted`, or `cooldown` |
| createdAt | Immutable audit time |

Indexes support a report filtered by month/source and grouped by operation/profile/tier/outcome.
