# Contract: Operator audit and delivery surfaces

## /why evidence block

For a stored provider record, /why includes a concise Ukrainian block with:

- source name and the phrase that this is an AUTO.RIA provider active-market estimate, not a
  confirmed sale price;
- amount/currency and available range/statistics;
- source time/freshness, query mode, input completeness, policy/adapter version;
- eligible/review/unavailable/deferred decision and all key reasons;
- provider-versus-legacy difference when both exist.

It reads local persistence only. It never logs or renders a credential, full VIN/plate, seller
contact, raw response, or an invented range.

## /valuation_audit command

Admin-only, read-only command. It performs no provider request and reports a selected time window:

    coverage: selected, admitted, available, review, unavailable, deferred
    quality: missing facts, relaxed dimensions, lookup modes, stale evidence
    source: auth/schema/timeout/429/empty outcomes, retries, latency
    comparison: provider-to-legacy delta buckets including >=20%
    economics: allocation, used/reserved, charge status, cache/dedup
    gold corpus: strata coverage and parity classification

When no data is available, the command says so rather than showing zero-quality metrics as positive
evidence. Unauthorized chats receive no audit data.

## Activation boundary

This contract has no command that changes score or provider policy to live. A future activation needs
a new approved change after the audit reports source parity, budget reconciliation, coverage, and
outcome evidence required by ADR-0011.

