# Contract — AUTO.RIA official API (consumer)

What the AUTO.RIA adapter consumes. Basis for contract tests (recorded fixtures replayed with
`nock`; never call live in tests — Principle VI). Docs: developers.ria.com / docs-developers.ria.com.

Auth: `api_key` (query param) on every request. Free tier ~30 req/hour — the adapter MUST go
through the shared rate budget. ToS: display a backlink to AUTO.RIA (carried into alerts).

## Endpoints used

| Purpose | Request | Response (key fields) |
|---|---|---|
| Search | `GET /auto/search?api_key=…&<filters>` | list of listing ids (paged) |
| Listing info | `GET /auto/info?api_key=…&auto_id=<id>` | price (UAH/USD), make/model/year/mileage, region, seller, `linkToReport` (VIN), photos |
| Average price | `GET /auto/average_price?api_key=…&marka_id=&model_id=&city_id=&raceInt=&auto_options=` | cohort average (UAH & USD); mileage as range; options AND-combined |
| Average price (AI, trend) | `POST /auto/statistic-avarage-price/` | `graphData` (date + price over time) — optional trend signal |
| Dictionaries | `GET /auto/categories`, `/auto/.../marks`, `/auto/.../models`, `/auto/states`, `/auto/states/:id/cities`, … | id↔name maps (cache once) |

## Fixtures to record (test/contract/)

- `search.sample.json` — a page of ids for a known niche.
- `info.sample.json` — one full listing (incl. `linkToReport`).
- `average_price.sample.json` — cohort average + any sample-count field.
- `dictionaries/*.json` — marks, models, states, cities.

## Adapter mapping notes

- Cohort → average_price params: `marka_id`←make, `model_id`←model, `city_id`←region, `raceInt`←
  mileage band (array = range). Validate exact params against live samples during implementation.
- Confidence: prefer a sample-count from the average-price payload; else fall back to our stored
  comparable count (documented in [research.md](../research.md) R3/open items).
