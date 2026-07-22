---
title: Project goals & scope (living)
type: context
updated: 2026-07-22
---

# Project goals & scope

> Living document. Captures the "why" and the current scope so any agent has the goal without re-reading the whole chat. Durable decisions get promoted to ADRs; this stays the plain-language north star.

## Vision

Build an **operator's (перекуп's) assistant** that monitors car listings on auto.ria.com (room
for other sites later) and **ranks them by the probability of bringing the operator profit on
resale** ([[0006-operator-profit-vision|ADR-0006]], 2026-07-18). A deal = high expected
profitability — price below fair value stays the *dominant* factor, but liquidity, repair-risk,
seller motivation, positive condition evidence, and confidence all shape the score. The system
answers *"чи варто зараз подзвонити власнику?"*, not *"скільки коштує ця машина?"* — it is not
a market appraiser. Feature litmus test: *"чи використовує це хороший перекуп при купівлі?"*

> Previous framing ("priced meaningfully below fair market value with low risk") is superseded —
> it survives as the **price core** of the composite score.

## v1 scope (decided so far)

- **Source:** AUTO.RIA official API only, no scraping ([[0002-monitoring-via-official-api|ADR-0002]]).
- **Coverage:** a **narrow niche** (a few search profiles) on the free API tier — plan changed
  2026-07-22 to a **20,000 req/month pool** (same ~30 req/hr average ceiling, spent unevenly via
  a daily budget + priority queue; see [[0009-monthly-rate-limit-pool|ADR-0009]]).
- **Profitability:** composite **Total Deal Score** — price core (below fair value, anchored on
  RIA robust average) × liquidity × repair-risk × negotiation × seller × positives × confidence.
  See [[profitability-definition]], [[0006-operator-profit-vision|ADR-0006]], spec
  `specs/003-composite-deal-score/`. (Price core is implemented; factor modifiers are spec 003.)
- **Delivery:** Telegram bot notifications.
- **Stack:** NestJS · PostgreSQL · TypeORM · `@nestjs/schedule` cron + in-memory rate budget · Telegram bot. (No Redis/BullMQ in v1 — see [[0004-drop-redis-bullmq|ADR-0004]].)
- **Method:** strict Spec-Driven Development; clean code per [[coding-standards]].

## Explicitly later (not v1)

- Widening beyond the niche (needs a paid API package).
- Scraping fallback (only behind the source-adapter port, for a genuinely missing field).
- True resale-margin model / probability-of-profitable-resale prediction, ML, CV (needs
  accumulated outcomes; triggers in [[profitability-methods-coverage]] §5).
- Time-on-market & market-demand scores (Should-Have; B25 + snapshot history).
- Additional listing sources.

## The 4 questions — resolved as **configuration** (user-controlled)

Decision (2026-07-12): none of these are hardcoded into v1. They are parameters the user
controls, so no upfront commitment is needed:

1. **Niche** → a **SearchProfile** config (region + make/models + price band). v1 ships the
   mechanism; the user adds concrete profiles later. Niche choice deferred, not blocking.
2. **Discount threshold** → config value per profile (suggested default 15–20%).
3. **Dealers** → config policy per profile: `label` | `exclude` | `ignore-distinction`.
4. **Currency** → configurable with switching; prices normalized via a stored FX rate.

Remaining true unknown: the profitability *methodology* must be crystal-clear before the
first spec — see [[profitability-definition]] (worked example added).

## Related (curated)

- [[00-INDEX]] · [[monitoring-approaches]] · [[profitability-definition]] · [[overview]]
