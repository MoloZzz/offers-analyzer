# Data Model: Listing Lifecycle and Tiered Re-checks

## `Listing` additions

| Field | Purpose | Rule |
|---|---|---|
| `recheckTier` | Current lifecycle tier (1, 2, or 3) | Derived after each eligible evaluation or re-check. |
| `nextRecheckAt` | Earliest timestamp for lifecycle selection | Updated only after a completed selection outcome. |
| `lastAlertedAmount` | Same-listing repeat-alert baseline | Updated atomically with a sent listing alert. |
| `lastAlertedCurrency` | Currency of the baseline | Comparison uses a normalized amount. |

Existing `status`, `profileId`, `lastScore`, `lastEvaluatedAt`, `firstSeenAt`, and
`PriceObservation` supply the remaining lifecycle context.

## Derived values

- `scoreDistance = max(0, threshold - score) / threshold`.
- Base tier: 1 when distance <= 0.10; 2 when <= 0.25; otherwise 3.
- Urgency promotion: reduce the tier number by one when DOM >45 days or price-cut count >=1.
- Due interval: tier 1 = 2 days; tier 2 = 7 days; tier 3 = 14 days.

## State transitions

1. A completed evaluation of an active listing derives tier and due time.
2. A due re-check succeeds without a lower price: retain/recompute schedule, no alert.
3. A due re-check finds a lower price: write observation, record passive price-drop outcome,
   re-evaluate, then recompute schedule and potential repeat alert.
4. A listing becomes removed/sold: clear lifecycle eligibility; it is excluded from selection.
5. Budget denial or transient fetch failure: leave due time intact for a later retry.
