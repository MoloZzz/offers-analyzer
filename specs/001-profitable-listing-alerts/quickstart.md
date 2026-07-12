# Quickstart — Profitable Listing Alerts (validation guide)

How to run and prove the feature end-to-end. Run all shell commands through RTK (Principle VII).
This is a validation/run guide — implementation lives in `tasks.md` + the code.

## Prerequisites

- Node.js 20 LTS, npm
- PostgreSQL and Redis reachable
- AUTO.RIA API key (developers.ria.com)
- Telegram bot token (@BotFather)

## Environment (`.env`, gitignored)

```text
DATABASE_URL=postgres://user:pass@localhost:5432/offers
REDIS_URL=redis://localhost:6379
AUTO_RIA_API_KEY=...
TELEGRAM_BOT_TOKEN=...
NBU_RATE_URL=https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json
RATE_BUDGET_PER_HOUR=30
DEFAULT_DISCOUNT_THRESHOLD_PCT=15
DEFAULT_CONFIDENCE_MIN_SAMPLES=10
```

## Setup & run

```bash
rtk npm install
rtk npm run migration:run          # create schema (data-model.md)
rtk npm run start:dev              # bot + scheduler
```

## Validation scenarios (map to spec)

1. **Alert on a below-market listing (US1 / FR-002…007)**
   - Seed one SearchProfile (a niche). In `test`/dev, feed the AUTO.RIA adapter the recorded
     `contracts/` fixtures: a listing ~18% below its cohort average, sample size above the min.
   - Expected: subscriber receives one Telegram alert with asking, fair value, discount %,
     confidence, checks, and the AUTO.RIA link.

2. **No alert when fairly priced / thin data (FR-005, SC-004)**
   - Fixture priced at market, and another with a tiny cohort sample.
   - Expected: no alerts.

3. **Threshold & dealer policy honored (US2 / FR-010)**
   - Profile threshold 20%; an 18%-below fixture → no alert; a 22%-below fixture → alert.
   - Profile dealer policy `exclude`; a dealer fixture → no alert; `label` → alert marked dealer.

4. **No duplicate / relist handling (FR-008, SC-003)**
   - Re-run the cycle over the same fixture id → no second "new" alert.

5. **Rate budget respected (FR-012, SC-005)**
   - Set `RATE_BUDGET_PER_HOUR=5`, queue more work than that → confirm no more than 5 source
     calls/hour and a deferral (no limit breach; operator warned when exhausted).

6. **Price drop (FR-009)**
   - Observe a listing, then feed a lower price crossing into range → a distinct price-drop message.

## Tests

```bash
rtk npm test                       # unit: valuation, dedup, budget
rtk npm run test:contract          # AUTO.RIA fixtures replayed (no live calls)
```

Expected: valuation/dedup/budget unit tests pass; contract tests validate the adapter against
recorded fixtures without hitting the live 30/hr endpoint.

## References

- Entities: [data-model.md](./data-model.md)
- Contracts: [contracts/](./contracts/)
- Decisions: [research.md](./research.md)
