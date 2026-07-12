---
title: ADR-0004 — Drop Redis/BullMQ for v1 (in-memory rate budget)
type: decision
status: Accepted
updated: 2026-07-13
---

# ADR-0004 — Drop Redis/BullMQ for v1 (in-memory rate budget)

**Status:** Accepted
**Date:** 2026-07-13

## Context

v1 is a single-instance monitor of a narrow niche. The only reason infrastructure was introduced was the AUTO.RIA ~30 req/hour cap. The `plan` (research R2) chose Redis + BullMQ for the rate budget and scheduling — a scale-oriented default that is premature here and conflicts with the simplicity principle (constitution §III, YAGNI). The user flagged the added complexity.

## Decision

No Redis and no BullMQ in v1:
- The rate budget is an **in-memory fixed-window counter** (`RateBudgetService`).
- Polling is a **`@nestjs/schedule` cron** (`PollingModule`) that calls the pipeline directly — no queue.
- Removed `ioredis` and `bullmq` dependencies, the `REDIS_URL` config, and the Redis service from `docker-compose`.

The only remaining infrastructure is **PostgreSQL**, which is genuinely needed (listings + price history).

## Consequences

**Positive:** simpler stack, fewer moving parts, faster to run and reason about.

**Negative / trade-off:** the in-memory counter **resets on process restart**, so a restart mid-hour could allow up to a second budget in that hour — acceptable for a single instance. A durable (Postgres-backed) counter is in the [[backlog]] for when restarts are frequent or we run multiple instances.

Supersedes the Redis/BullMQ elements of [[0002-monitoring-via-official-api|ADR-0002]] and `plan` research R2.

## Related
- [[decisions/README]] · [[backlog]] · [[overview]]
