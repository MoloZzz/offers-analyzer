---
summary: Meaningful observations and advice: deterministic first, then an LLM monthly review.
---
# Plan 06 — Insights (advice)

## Goal
The system provides meaningful observations and advice: deterministic (rule-based) first,
then an LLM monthly review.

## Scope
- In: rule-based insight generator in the digest; optional LLM layer for the monthly review.
- Out: chat with a financial assistant; automatic actions based on advice.

## Steps
1. `InsightGenerator`: set of rules over aggregates ([[Plan 03 — Aggregations]]):
   - category X: +N% over the 3-month average (configurable threshold, e.g. ≥30%);
   - savings rate fell/rose compared with the previous month;
   - subscriptions: total ≥N% of expenses / new expensive subscription;
   - unusually many small expenses in a category (frequency spike);
   - crypto: average cost basis of the month's purchases vs the previous month.
2. Add insights as a section in the digest ([[Plan 05 — Alerts & Telegram]]).
3. LLM layer (optional, off by default, `INSIGHTS_LLM=on`):
   - input — **aggregates and insights only** (no raw transactions/merchant names
     beyond what is needed) — privacy and token control;
   - output — a short monthly review in Ukrainian in the digest;
   - provider/key from env (NR3), and an LLM error does not break the digest.

## Acceptance criteria
- [ ] Rule-based insights are deterministic on fixtures (snapshot tests of the text).
- [ ] Thresholds are configurable; below the threshold — no output (negative tests).
- [ ] LLM is disabled by default; everything works without a key.
- [ ] Only aggregates enter the LLM prompt (test payload contents).
- [ ] LLM failure → digest is delivered without the review, with a log (isolation).
- [ ] `tsc` is clean, and existing tests are green.
