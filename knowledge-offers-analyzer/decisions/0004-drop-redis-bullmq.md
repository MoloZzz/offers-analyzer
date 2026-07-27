---
title: ADR-0004 — Drop Redis/BullMQ for v1 (Postgres-backed rate budget)
type: decision
status: Accepted
updated: 2026-07-28
---

# ADR-0004 — Drop Redis/BullMQ for v1 (Postgres-backed rate budget)

**Status:** Accepted
**Date:** 2026-07-13

## Context

v1 is a single-instance monitor of a narrow niche. The original plan chose Redis + BullMQ for rate budgeting and scheduling — a scale-oriented default that is premature and conflicts with the simplicity principle (constitution §III, YAGNI). The user flagged the added complexity. The runtime budget later changed from an hourly window to a monthly pool; [[0009-monthly-rate-limit-pool|ADR-0009]] owns that policy.

## Decision

No Redis and no BullMQ in v1:
- The rate budget is **Postgres-backed** (`RateBudgetService`, `rate_budget_windows`, `monthly_budget_states`); its current monthly-pool policy is defined by ADR-0009.
- Polling is a **`@nestjs/schedule` cron** (`PollingModule`) that calls the pipeline directly — no queue infrastructure. The priority queue in ADR-0009 is a scheduling policy, not BullMQ.
- Removed `ioredis` and `bullmq` dependencies, the `REDIS_URL` config, and the Redis service from `docker-compose`.

The only remaining infrastructure is **PostgreSQL**, which is genuinely needed (listings + price history).

## Consequences

**Positive:** simpler stack, fewer moving parts, faster to run and reason about.

**Negative / trade-off:** the counter was initially in-memory (reset on restart). It is now a **durable Postgres-backed** ledger (`rate_budget_windows` plus `monthly_budget_states`), so the budget survives restarts and matches the source's real usage — Redis is still not needed. Operational spend visibility remains a required follow-up under [[0011-evidence-gated-scoring-rollout|ADR-0011]].

Supersedes the Redis/BullMQ elements of [[0002-monitoring-via-official-api|ADR-0002]] and `plan` research R2.

## Related
- [[decisions/README]] · [[backlog]] · [[overview]]
