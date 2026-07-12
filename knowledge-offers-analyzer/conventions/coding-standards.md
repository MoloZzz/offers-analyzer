---
title: Coding standards & conventions
type: convention
updated: 2026-07-12
---

# Coding standards & conventions

> Goal (agreed): **clean code — readable, simple, and extensible where it pays off.** Record a convention here the moment it's agreed; future agents follow this note, not their defaults. Grounded in reputable sources, not a random boilerplate repo: `goldbergyoni/nodebestpractices`, the official NestJS docs, and `typescript-eslint` (strict).

## Principles (the "why")

- **Readable first.** Optimize for the next reader. Clear names over cleverness; small functions that do one thing.
- **SRP / small units.** One reason to change per class/module. Thin controllers → services → repositories. Business logic never lives in controllers.
- **Simple over flexible.** Don't add abstraction until a second real case exists (YAGNI). Extensibility where the domain clearly demands it — e.g. the `ListingSource` port for multiple sites (see [[monitoring-approaches]]) — not everywhere.
- **Dependency inversion.** Depend on interfaces (ports), not concretions. External systems (AUTO.RIA API, Telegram, DB) sit behind adapters so they're swappable and testable.
- **Explicit boundaries.** Domain logic isolated from framework/IO. DTOs validated at the edge; typed everywhere (no `any`).
- **Errors are values you handle.** No silent catches; fail loud, log with context, use typed error paths.

## NestJS structure

- Feature modules (e.g. `listings`, `sources`, `valuation`, `notifications`) — each with its own controller/service/dto/entities.
- DTOs with `class-validator` + `ValidationPipe`; never trust external input (API responses, bot commands).
- Config via `@nestjs/config`; **no secrets in code** (API key, bot token → `.env`, already gitignored).
- Async work (polling, notifications) via a queue (BullMQ + Redis), not inline in request handlers.

## Testing

- Unit-test the logic that matters: valuation/profitability rules, dedup, budget scheduling.
- The external API is **contract-tested against fixtures** — tests must not hit the live 30/hr endpoint. Record real responses once, replay them.
- Run test/build/lint through RTK (`../.claude/RTK.md`).

## Enforcement (start pragmatic, tighten as needed)

Principles that aren't enforced by tooling rot — but keep it proportionate to a small project:

- **Now (v1):** strict `tsconfig` (`strict: true`, `noImplicitAny`), ESLint (`typescript-eslint` recommended-strict + `import/order`), Prettier. One command: `npm run lint` / `npm run format` (via RTK).
- **Light gate:** Husky + lint-staged so commits are auto-formatted/linted. Add when it stops being annoying-vs-useful.
- **Later (when contributors/CI grow):** Conventional Commits + commitlint, CI running rtk-wrapped lint/test/build, a coverage floor on core logic. Don't front-load these.

Rule of thumb: enough tooling to keep the code clean automatically, not so much it slows a one-person v1.

## Related

- [[00-INDEX]] · [[overview]] · [[environment-setup]] · [[monitoring-approaches]]
