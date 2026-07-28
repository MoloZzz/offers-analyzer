# Internal Contract: Lifecycle Re-check Scheduler

## Selection input

`selectDueRechecks(now, limit)` returns active listings where `nextRecheckAt <= now`, ordered by:

1. `recheckTier` ascending;
2. due time ascending;
3. score descending as a stable value tie-breaker.

Each selected item includes listing id, source external id, profile id, and tier.

## Re-check result

`completeRecheck(item, detail, now)` records the fetched state and returns:

- `priceChanged: boolean`
- `reEvaluated: boolean`
- `repeatAlertEligible: boolean`
- `nextRecheckAt: timestamp`

The operation never sends a notification itself; the existing notification boundary formats and dispatches an eligible alert.

## Repeat alert decision

`shouldRepeatAlert(previousAlertedAmount, currentAmount)` is true only when a previous baseline
exists and `currentAmount <= previousAlertedAmount * 0.95`. A first qualifying alert remains
governed by existing opportunity and VIN-level de-duplication behavior.
