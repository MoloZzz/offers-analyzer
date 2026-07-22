---
title: Decision log (ADRs)
type: moc
updated: 2026-07-22
---

# Decision log (Architecture Decision Records)

> Every non-trivial, hard-to-reverse decision gets a short ADR here. This is the project's "why" memory. Copy [[adr-template]] to a new numbered file.

## Index

- [[0001-adopt-sdd-vault-rtk|ADR-0001]] — Adopt Spec-Driven Development, a knowledge vault, and RTK (Accepted)
- [[0002-monitoring-via-official-api|ADR-0002]] — Monitor AUTO.RIA via the official API, narrow niche on free tier (Accepted)
- [[0003-decoupled-context-zone|ADR-0003]] — Decoupled context zone instead of a second knowledge base (Accepted)
- [[0004-drop-redis-bullmq|ADR-0004]] — Drop Redis/BullMQ for v1; in-memory rate budget (Accepted)
- [[0005-versioned-parameter-sets|ADR-0005]] — Versioned ParameterSets + human-in-the-loop calibration (Accepted)
- [[0006-operator-profit-vision|ADR-0006]] — Vision shift: rank by expected operator profit (composite Total Deal Score), not just discount (Accepted)
- [[0007-structured-logging-nestjs-pino|ADR-0007]] — Structured logging via nestjs-pino (Accepted)
- [[0008-global-error-handling|ADR-0008]] — Global error handling: exception filter + cron guards + process-level net (Accepted)

## How to add one

1. Copy `adr-template.md` → `NNNN-short-title.md` (next number).
2. Fill Context / Decision / Consequences.
3. Add a line to the Index above.
4. Link it from wherever the decision is relevant (e.g. [[overview]], [[coding-standards]]).

## Related

- [[00-INDEX]]
