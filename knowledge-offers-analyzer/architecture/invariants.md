---
title: Architecture and operational invariants
type: architecture
updated: 2026-08-02
summary: Refactor-resistant source, budget, scoring, and evidence safety properties.
---

# Architecture and operational invariants

> System properties that must survive refactors. ADRs remain authoritative when this note and an
> ADR differ.

## Source and boundary invariants

- Listing collection uses the official AUTO.RIA API through the source-adapter boundary. A new
  source must implement the port rather than leak source-specific behavior into domain services.
- No scraping is introduced as an incidental fallback. Any exception requires an explicit decision
  and stays behind the source-adapter boundary.

## Budget and recovery invariants

- The request budget is durable, restart-safe, and shared through PostgreSQL-backed accounting;
  it is not an in-memory best effort counter.
- Budget exhaustion and a refused low-priority operation fail safely. They cannot silently turn into
  an unbounded retry loop or stop unrelated fresh-listing discovery.
- Already scored listings receive no routine legacy rechecks while SPEC-005 is paused. Bounded
  recovery for never-scored listings is the only allowed exception.

## Scoring invariants

- Price remains dominant: non-price factors cannot turn an at- or above-market listing into an
  alert.
- Unknown factor data is neutral, not invented. Thin evidence preserves the existing confidence
  gate and freezes automated changes.
- Hard disqualifiers clamp the score to a non-opportunity even when price looks attractive. The set
  of hard disqualifiers is deliberately narrow: write-off and structural evidence, not accident
  presence. Lesser accident damage is a graded penalty
  ([[0020-graded-accident-risk|ADR-0020]]).
- Counterparty-authored text may raise an assessed risk freely, but may lower it only with
  independent corroboration. Applied to accident severity (ADR-0020), implemented as a floor rather
  than a weight, so a deep discount cannot out-earn it.
- For **claimed mileage** the same asymmetry is absolute rather than corroborable: the analytic
  correction may only lower fair value, never raise it, whatever the VIN state — enforced inside
  `mileageAdjustmentPct`, not at its call sites
  ([[0023-one-sided-mileage-adjustment|ADR-0023]], narrowing
  [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]]).
- Scoring weights, bounds, and activation state are carried by versioned, reversible ParameterSets.
- Before an evidence-gated activation, scoring stays price-core based. Applying correction k and
  activating factor bounds is one rollout, not two independent changes.
- Assessment confidence is an output, never an input: it MUST NOT be multiplied into `score`,
  `priceCore`, or any factor modifier. Doing so would triple-count missing evidence already
  counted by the cohort-size confidence gate and the `unverified_bargain` dampener
  ([[0018-assessment-confidence-and-monetary-output|ADR-0018]]).
- Estimated costs are expected values with a stated σ, never line-item invoices, and estimated
  selling time is a liquidity-tier bucket, never a single-day figure.
- Advisory AI output is an output, never an input: it MUST NOT influence any score, factor,
  confidence, threshold, ParameterSet, alert set, or correction, in either direction — it can
  neither promote nor veto. The `valuation` module never imports the `analysis` module, so the
  boundary is a visible import rather than a data-flow assumption
  ([[0019-advisory-only-ai-analysis|ADR-0019]]).
- Counterparty-authored text (a seller description) reaching a language model is passed as delimited
  untrusted data, never as instruction; schema-invalid responses are discarded whole, never
  repaired or partially rendered.

## Evidence and explainability invariants

- Every factor and alert decision must be explainable in operator language.
- A rollout-changing score needs persisted evaluation provenance: inputs, parameter version,
  threshold, factor reasons, and timestamp.
- Candidate calibration or learned parameters remain bounded and require operator approval.

## Authority

- [[0002-monitoring-via-official-api|ADR-0002]]
- [[0004-drop-redis-bullmq|ADR-0004]]
- [[0005-versioned-parameter-sets|ADR-0005]]
- [[0006-operator-profit-vision|ADR-0006]]
- [[0009-monthly-rate-limit-pool|ADR-0009]]
- [[0010-defer-factor-activation-until-k|ADR-0010]]
- [[0011-evidence-gated-scoring-rollout|ADR-0011]]
- [[0013-budget-stabilization-before-lifecycle-rechecks|ADR-0013]]
