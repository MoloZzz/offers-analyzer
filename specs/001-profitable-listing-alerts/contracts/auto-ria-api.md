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

## Verified field mappings (from live responses, 2026-07-13)

**`/search`** → `result.search_result.ids` (clean id list). `result.search_result_common.data` also
lists `OfferOfTheDay` ads — do NOT use it. `result.search_result.count` = total matches.
`marka_id[]` / `model_id[]` **must be numeric ids** (names are silently ignored → all-cars search).
Returns **ids only, no prices** → confirms N+1 (one `/info` per listing).

**`/info`** (top-level unless noted):
- price: `USD` (number); also `UAH`, `EUR`.
- ids: `markId`, `modelId` (NOT `marka_id`/`model_id`); names `markName`, `modelName`, `title`.
- `year` = `autoData.year`; mileage = `autoData.raceInt` (**thousand km**).
- region: `stateData.stateId`, `stateData.cityId`.
- seller: `dealer` is an **object** — `dealer.id === 0` ⇒ private, else dealer.
- VIN report: `haveInfotechReport` (bool); VIN in `VIN`.
- link: `linkToView` is **relative** → prefix `https://auto.ria.com`.
- risk (→ red-flags): `autoInfoBar.{damage, onRepairParts, custom, confiscatedCar, underCredit, abroad}`.

**`/average_price`**: `marka_id`/`model_id` must be numeric; returns HTTP **400
`{message:"Not Enough Data"}`** for thin cohorts (treat as "no benchmark", not an error).
Verified fields: `arithmeticMean` (skewed by outliers), **`interQuartileMean`** (robust — we use
this as fair value), `percentiles` (`"1.0"`…`"99.0"`, incl. `"50.0"` median), `total` (sample size),
plus `prices[]` / `classifieds[]` (ignored). **Narrow the cohort** (year + `raceInt` band + city) or
the average mixes all years/mileages (a live all-years BMW 3-Series sample ranged 800…70000).
