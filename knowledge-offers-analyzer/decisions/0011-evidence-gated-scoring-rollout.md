---
title: ADR-0011 — Evidence-gated scoring rollout
type: decision
status: Accepted
updated: 2026-07-28
---

# ADR-0011 — Evidence-gated scoring rollout

**Status:** Accepted
**Date:** 2026-07-28

## Context

The product is designed to rank listings by the probability of operator profit, but production
currently uses only the price core. SPEC-004 will estimate a survivorship correction `k` from
disappearance events, and SPEC-003's first factor modifiers will activate in the same
`ParameterSet` change (ADR-0010). A disappearance is only a plausible sale and its last asking
price is not the realized transaction price, so a candidate `k` must be inspected before it
changes live alerts.

At the same time, the 20,000-request monthly pool funds both the market sweep (~5,400 requests per
month) and planned tiered re-checks (~4,300). ADR-0009 explicitly carries verification debt: the
indicative allocation has not yet been reconciled with real spend. Finally, live `/why` answers do
not preserve the exact inputs, parameter version, and threshold behind a past alert.

## Decision

1. **Scoring changes are evidence-gated.** Applying `k`, activating factor bounds, changing the
   threshold, or enabling auto-apply requires a candidate rollout report. It must show eligible
   event counts by cohort and fallback tier, void/relist rates, a bootstrap confidence interval for
   `k`, and stability across materially different cohorts. `k >= 0.97` remains a falsification of
   the survivorship hypothesis, not a number to tune around.
2. **Explanation provenance comes first.** B23 must persist the evaluation snapshot on every
   scored listing and Opportunity before any scoring activation. It includes valuation inputs,
   factor reasons, `ParameterSet` version, threshold, and timestamp; historical alerts must be
   explainable without a source re-fetch.
3. **Budget observability is a rollout gate.** Before enabling SPEC-005 or an additional
   expensive profile, SPEC-009 must expose actual spend and forecast by profile, operation, and
   priority tier, including remaining daily/monthly budget and reserve. The 20,000-request
   allocation is reforecast from real active-listing counts; the reserve is not used as a hidden
   permanent allocation.
4. **Human approval remains mandatory.** Fifteen closed deals permit a calibration review, not an
   automatic live change. Candidate ParameterSets are evaluated on a frozen or rolling validation
   slice and require operator approval; realized margin, loss share, and alert precision remain
   visible before and after rollout.

## Consequences

**Positive:** the first composite-score rollout is auditable and reversible; a wrong `k` or a
budget-model mistake cannot silently flood or starve alerts; learning follows actual operator
economics rather than cheap-looking listings.

**Negative / to maintain:** SPEC-004 gains a data-quality stage, B23 and SPEC-009 move ahead of
feature work, and the operator must explicitly approve a candidate ParameterSet. This delays a
flashy scoring release, but prevents tuning a measurement the team does not yet trust.

## Related

- [[decisions/README]] · [[0009-monthly-rate-limit-pool|ADR-0009]] · [[0010-defer-factor-activation-until-k|ADR-0010]]
- [[explainability-gaps]] · [[SPEC-009]] · spec `004-realized-price-calibration`
