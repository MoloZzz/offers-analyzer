# Contract: Valuation evidence and explanation

## Evidence writer input

    RecordValuationEvidence
      listing identity and optional profile/opportunity
      trigger and selection reason
      policy and adapter snapshots
      provider outcome
      legacy reference snapshot when available
      input completeness and comparability assessment

The service validates target, policy, finite amounts/currency, bounded JSON projection, redaction,
and terminal-state immutability before persistence.

## Comparability contract

| Condition | Status | Comparability |
|---|---|---|
| Feature disabled | not_configured | not_assessed |
| Required attribute fact absent | invalid_input | review |
| No source capacity | deferred | not_assessed |
| Valid provider estimate and all policy conditions pass | available | eligible |
| Valid provider estimate but any material relaxation/thin evidence | available | review |
| Source no data/failure/invalid schema | unavailable | not_assessed |

Reasons are stable codes plus human-readable Ukrainian labels. They include every missing/relaxed
dimension, source freshness, query mode, provider statistics availability, and legacy delta when
both values exist.

## Explanation contract

EvaluationExplanation V2 adds an optional providerEvidence reference:

    providerEvidence
      evidenceId
      target: active_listing_ask
      providerKey
      policyKey and adapterVersion
      status and comparability
      sourceCapturedAt
      queryMode
      estimate/range availability
      legacyDeltaPct
      reason codes

V1 remains valid and renders exactly as before. /why first reads persisted explanation/evidence and
must not call either provider or legacy source for a stored listing. A missing evidence pointer
renders an explicit shadow-not-collected state, not a fabricated estimate.

## Invariants

- Terminal evidence records are never overwritten.
- An evidence record cannot have status available without a positive finite estimate/currency.
- An eligible decision cannot coexist with missing policy-required facts, an attribute request
  lacking mileage, stale required evidence, or a material relaxed dimension.
- Provider evidence never mutates fairValue, score, threshold, ParameterSet, Opportunity eligibility,
  notification state, factor activation, or k.

