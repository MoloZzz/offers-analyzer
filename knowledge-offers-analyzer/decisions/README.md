---
title: Decision log (ADRs)
type: moc
updated: 2026-08-02
---

# Decision log (Architecture Decision Records)

> Every non-trivial, hard-to-reverse decision gets a short ADR here. This is the project's "why" memory. Copy [[adr-template]] to a new numbered file.

## Index

- [[0001-adopt-sdd-vault-rtk|ADR-0001]] — Adopt Spec-Driven Development, a knowledge vault, and RTK (Accepted)
- [[0002-monitoring-via-official-api|ADR-0002]] — Monitor AUTO.RIA via the official API, narrow niche on free tier (Accepted)
- [[0003-decoupled-context-zone|ADR-0003]] — Decoupled context zone instead of a second knowledge base (Accepted)
- [[0004-drop-redis-bullmq|ADR-0004]] — Drop Redis/BullMQ for v1; historical origin of the budget ledger (superseded by ADR-0009 monthly pool) (Accepted)
- [[0005-versioned-parameter-sets|ADR-0005]] — Versioned ParameterSets + human-in-the-loop calibration (Accepted)
- [[0006-operator-profit-vision|ADR-0006]] — Vision shift: rank by expected operator profit (composite Total Deal Score), not just discount (Accepted)
- [[0007-structured-logging-nestjs-pino|ADR-0007]] — Structured logging via nestjs-pino (Accepted)
- [[0008-global-error-handling|ADR-0008]] — Global error handling: exception filter + cron guards + process-level net (Accepted)
- [[0009-monthly-rate-limit-pool|ADR-0009]] — Rate limiting: monthly pool + priority queue instead of hourly window (Accepted)
- [[0010-defer-factor-activation-until-k|ADR-0010]] — Keep spec-003 factors inactive until the survivorship correction `k` lands; one combined activation + threshold re-validation (Accepted)
- [[0011-evidence-gated-scoring-rollout|ADR-0011]] — Require evidence, explanation provenance, and budget observability before scoring rollout (Accepted)
- [[0012-material-repeat-alert-threshold|ADR-0012]] — Require a 5% price reduction for a same-listing repeat alert (Accepted)
- [[0013-budget-stabilization-before-lifecycle-rechecks|ADR-0013]] — Stabilize legacy demand before any lifecycle rechecks (Accepted)

- [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] - Prefer median benchmarks and guard claimed-mileage uplifts (Accepted)
- [[0015-hybrid-executable-vault|ADR-0015]] — Adopt a hybrid executable vault with bounded retrieval and phased enforcement (Accepted)

- [[0016-portable-ai-infra-kit|ADR-0016]] — Package reusable AI infrastructure as a portable bootstrap kit (Accepted)
- [[0017-shadow-valuation-evidence|ADR-0017]] — Keep provider valuation evidence shadow-only (Proposed)

## How to add one

1. Copy `adr-template.md` → `NNNN-short-title.md` (next number).
2. Fill Context / Decision / Consequences.
3. Add a line to the Index above.
4. Link it from wherever the decision is relevant (e.g. [[overview]], [[coding-standards]]).

## Related

- [[00-INDEX]]
