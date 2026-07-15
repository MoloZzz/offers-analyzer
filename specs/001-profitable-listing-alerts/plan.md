# Implementation Plan: Profitable Listing Alerts

**Branch**: `001-profitable-listing-alerts` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-profitable-listing-alerts/spec.md`

## Summary

Monitor user-configured AUTO.RIA niches through the official API, evaluate each new listing
against a fair-value benchmark (RIA average price), flag low-risk below-market listings as
Opportunities, and push them to subscribers via Telegram — all within the free-tier request
budget (~30 req/hour). Approach: a NestJS backend with a rate-limited BullMQ scheduler, a
`ListingSource` port (AUTO.RIA adapter first), PostgreSQL for listings + price history, and a
Telegram bot as the interface. See [research.md](./research.md) for decisions.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS

**Primary Dependencies**: NestJS 10, TypeORM + `@nestjs/typeorm`, `pg`, `@nestjs/schedule`
(cron), `nestjs-telegraf` (Telegram), `@nestjs/config`, `class-validator`/`class-transformer`,
`undici` (HTTP). No Redis/BullMQ in v1 — see ADR-0004.

**Storage**: PostgreSQL (listings, price history, profiles, subscribers, opportunities). Rate
budget is in-memory (no Redis — ADR-0004)

**Testing**: Jest (unit + integration), `nock`/recorded fixtures for AUTO.RIA contract tests,
Supertest for bot/HTTP surface

**Target Platform**: Linux server (Docker), single deployable service

**Project Type**: Backend web-service (no web frontend; Telegram bot is the UI)

**Performance Goals**: alert within 15 min of a listing appearing; stay 100% within the API
request budget; process a niche's cycle comfortably inside the hourly window

**Constraints**: AUTO.RIA free tier ~30 req/hour (hard); required backlink to AUTO.RIA in every
alert; secrets in env only; idempotent notifications

**Scale/Scope**: v1 = a few niches, small user set, low tens of thousands of stored listings

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Spec-Driven Development | Spec approved before plan; plan traces to spec FRs | ✅ Pass |
| II. Knowledge Base is source of truth | Plan + decisions promoted to the vault | ✅ Pass (on completion) |
| III. Clean, Simple Code | Feature modules, thin controllers, no premature abstraction | ✅ Pass |
| IV. Ports & Adapters | `ListingSource`, `Notifier`, `ExchangeRate` ports; AUTO.RIA = first adapter | ✅ Pass |
| V. Respect External Limits & Legality | Rate-budget scheduler, backlink in messages, API-only, secrets in env | ✅ Pass |
| VI. Test What Matters + contract-test external API | Unit tests for valuation/dedup/budget; AUTO.RIA replayed from fixtures | ✅ Pass |
| VII. Token-Efficient Tooling (RTK) | All dev commands run via RTK | ✅ Pass |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-profitable-listing-alerts/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities
├── quickstart.md        # Phase 1 run/validation guide
├── contracts/           # Phase 1 interface contracts
│   ├── listing-source.port.md
│   ├── auto-ria-api.md
│   └── telegram-commands.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── main.ts
├── app.module.ts
├── common/                  # config, logging, errors, shared types
├── modules/
│   ├── sources/             # ListingSource port + AUTO.RIA adapter
│   ├── listings/            # Listing & PriceObservation entities, dedup + price history
│   ├── valuation/           # deal score (−1..1), confidence, red-flags + benchmark cache
│   ├── profiles/            # SearchProfile config + seed
│   ├── notifications/       # Telegram notifier, Subscriber, Notification, formatting
│   ├── scheduling/          # in-memory rate budget (fixed window)
│   ├── polling/             # cron pipeline: search → new → value → alert
│   └── fx/                  # ExchangeRate port (NBU adapter lands in US2)
test/
├── unit/                    # valuation, dedup, budget logic
├── integration/             # module wiring, DB, queue
└── contract/                # AUTO.RIA fixtures + replay
```

**Structure Decision**: Single NestJS backend service, organized by feature module with a port
per external system (Principle IV). No frontend package — the Telegram bot is the user surface.

## Complexity Tracking

No constitution violations — section intentionally empty.
