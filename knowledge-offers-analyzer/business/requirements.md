---
title: Product requirements
type: business
updated: 2026-08-02
summary: Durable product obligations, safety guardrails, and rollout requirements.
---

# Product requirements

> Durable product obligations. This note describes what must be true for users; implementation
> constraints and safety properties are collected in [[invariants|Architecture invariants]].

## Monitoring and coverage

1. The system monitors only operator-configured AUTO.RIA search profiles through the official API.
2. It must spend the approved monthly request pool deliberately: fresh discovery and required
   evidence take precedence over optional work.
3. An unavailable, low-priority benchmark or request must degrade one evaluation safely rather
   than stop the rest of discovery.

## Evaluation and alerts

1. A listing may alert only when it is meaningfully below a defensible fair-value benchmark,
   has sufficient confidence, and has no hard disqualifier.
2. Fair value uses the AUTO.RIA median when available. A claimed low mileage may **never** increase
   fair value — the mileage correction is one-sided and applies downward only, regardless of VIN
   evidence. See [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] and
   [[0023-one-sided-mileage-adjustment|ADR-0023]].
3. The initial alert decision is price-core based. Future factors may refine ranking but may not
   turn an at- or above-market listing into an alert.
4. Alerts and the Telegram explanation must state the practical reasons behind the decision, not
   present a black-box score.
5. Repeated alerts for the same car require material new value, such as a qualifying price change;
   routine lifecycle rechecks remain paused until their evidence and budget gates are met.

## Operator control and feedback

1. The operator can configure the watched niche, threshold, dealer policy, and working currency
   through SearchProfile configuration.
2. The system captures operator feedback and post-deal economics as available, without requiring
   an expensive or multi-step workflow.
3. Calibration and learned parameter changes are bounded, inspectable, reversible, and
   human-approved. Thin evidence must freeze rather than fabricate a conclusion.

## Release and evidence requirements

1. Applying the survivorship correction, activating score factors, changing a threshold, or
   enabling automatic application requires the evidence report and approval defined by
   [[0011-evidence-gated-scoring-rollout|ADR-0011]].
2. Historical scored listings and alerts need durable explanation provenance before a scoring
   rollout changes live behavior.
3. Budget expansion and lifecycle work require a reconciled ledger and forecast; reserve capacity
   is not hidden permanent allocation.

## Non-requirements for v1

- General vehicle appraisal, automated purchase decisions, and promises of realized profit.
- Scraping, opaque ML scoring, or a source-specific shortcut that bypasses the source-adapter
  boundary.
- Broad-market coverage that the approved request pool cannot support.

## Related

- [[vision-and-goals|Product vision and goals]]
- [[profitability-definition]]
- [[when-to-alert]]
- [[0002-monitoring-via-official-api|ADR-0002]]
- [[0013-budget-stabilization-before-lifecycle-rechecks|ADR-0013]]
