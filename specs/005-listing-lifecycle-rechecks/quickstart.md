# Quickstart: Validate Listing Lifecycle Re-checks

## Prerequisites

- A reconciled current-month `/budget` report and explicit operator approval to enable lifecycle work.
- Active profile configuration and a database with evaluated listings.

## Validation scenarios

1. Run unit tests for tier calculation using threshold boundaries, DOM 45/46, and a recorded price cut.
2. Seed an active tier-1 listing due now; run one scheduler cycle with an allowed budget and verify one attributed tier-1 detail request.
3. Return a 5% lower detail price that now meets the existing opportunity gate; verify a new observation, re-score, and exactly one repeat alert.
4. Repeat with a 4.99% reduction; verify persistence/re-score but no repeat alert.
5. Mark a due listing `removed`; verify selection excludes it and consumes no request.
6. Deny the lifecycle request through the budget service; verify the item remains due and `/budget` reports the deferred operation.

Run the focused Jest suites, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run vault:check` (wrapped with `rtk` where available).
