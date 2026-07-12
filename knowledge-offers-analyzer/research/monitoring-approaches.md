---
title: Research — how to monitor AUTO.RIA (API vs scraping)
type: research
status: Decided
updated: 2026-07-12
---

# Research — monitoring approach for AUTO.RIA

> Question: how does Offers Analyzer obtain listings from auto.ria to detect profitable ones? Decision needed before the ingestion architecture. Related: [[profitability-definition]], [[overview]].

## Goal & constraints

- Continuously discover new/updated car listings in a chosen niche and evaluate them (see [[profitability-definition]]).
- **Locked decision:** v1 runs on the **free tier**, monitoring a **narrow niche** (a few search profiles), not the whole site.
- Dominant constraint: the official API free tier is **~30 requests/hour per key** (paid packages raise this).

## The official AUTO.RIA API (what exists)

Developers portal: `developers.ria.com` (free key in the account area). Key endpoints:

| Purpose | Endpoint | Notes |
|---|---|---|
| Search listings | `GET /auto/search?api_key=…&<filters>` | Returns **IDs** of matching listings (paginated). Filters: category, brand, model, year, region/city, price, mileage, fuel, gearbox, etc. |
| Listing details | `GET /auto/info?api_key=…&auto_id=<id>` | Full record: price (UAH/USD), specs, photos, seller, VIN-report link (`linkToReport`). |
| Average price (classic) | `GET /auto/average_price?api_key=…&marka_id=…&model_id=…&city_id=…&raceInt=…` | RIA's **market average** for a cohort; supports mileage range and options (AND). Core input for "profitable". |
| Average price (AI, by periods) | `POST /auto/statistic-avarage-price/` | Trend over time (`graphData`, UAH+USD). Useful for price-direction signals. |
| Reference dictionaries | `/auto/categories`, `/auto/…/marks`, `/auto/…/models`, `/auto/states`, `/auto/states/:id/cities`, `/auto/…/gearboxes`, bodystyles… | Low-churn lookups — **cache once**, don't spend the hourly budget on them. |

ToS: usage requires a visible backlink to AUTO.RIA and is governed by the RIA offer agreement.

## Options

**A. Official API (first-party).** Query the endpoints above.
**B. Headless scraping (Playwright/Selenium).** Render auto.ria pages and parse HTML.
**C. Hybrid.** API as primary; scraper fills gaps the API doesn't expose.

## Trade-offs

| Dimension | A. Official API | B. Scraping | C. Hybrid |
|---|---|---|---|
| Legality / ToS | ✅ Sanctioned (backlink required) | ❌ Against ToS; blockable | ⚠️ Only as good as its scraping part |
| Reliability / stability | ✅ Stable JSON contract | ❌ Breaks on markup/anti-bot changes | ⚠️ Two failure modes |
| Anti-bot risk (Cloudflare, bans) | ✅ None | ❌ High; IP bans, CAPTCHAs | ⚠️ Present for scraper |
| "Average price" benchmark | ✅ First-party, free | ❌ Must reinvent from scraped data | ✅ From API |
| Data richness | ✅ Structured, incl. VIN-report link | ⚠️ Whatever is on the page | ✅ Superset |
| Rate limit | ❌ 30/hr free (paid raises it) | ✅ No hard cap (but bans) | ⚠️ Mixed |
| Maintenance cost | ✅ Low | ❌ High (constant fixes) | ❌ Highest |
| Dev speed to v1 | ✅ Fast | ⚠️ Slow (anti-bot plumbing) | ⚠️ Slow |
| Cost path to scale | 💳 Paid package | 🖥️ Proxies/infra + risk | Mixed |

## Recommendation — **A. Official API-first**

Reasons: it's the only legal, stable path; it hands us the **average-price benchmark for free**, which is the backbone of the profitability logic; and it gets us to a working v1 fastest with the least maintenance. Scraping's only advantage — no 30/hr cap — is exactly what the "narrow niche on free tier" decision already neutralizes, while its costs (ToS breach, anti-bot war, brittleness) are severe.

**Scaling path:** when the niche must widen, buy a paid API package (raise the limit) before considering scraping.

**Scraping is deferred, not forbidden:** if a genuinely needed field is API-only-absent later, add a scraper **behind the source-adapter interface** (below) for that field only. Out of scope for v1.

## Architecture implications (feed into the spec/plan)

1. **Source-adapter port.** Define a `ListingSource` interface (search → ids, fetch → detail, averagePrice → benchmark). AUTO.RIA API is the first adapter; future sites/scrapers implement the same port. ("Maybe other sites later" is designed-in now.)
2. **Request budgeting.** Cache dictionaries; spend the 30/hr on `search` (cheap, paged) + `info` for **new** candidates only + `average_price` per cohort (cache per cohort/day).
3. **Dedup & state.** Persist seen `auto_id`s; only pull `info` for unseen/changed listings; track price changes and relists.
4. **Scheduling.** A queue/cron (e.g. BullMQ + Redis) that respects the hourly cap with backoff and a dead-man's-switch alert when the budget is exhausted.
5. **History.** Store listings + observed prices over time (own statistics + price-drop detection). See [[overview]].

## Sources

- developers.ria.com — API platform & pricing
- docs-developers.ria.com — endpoint docs (search, info, average price)
- github.com/ria-com/auto-ria-rest-api — REST API reference

## Related

- [[00-INDEX]] · [[profitability-definition]] · [[overview]] · [[decisions/README]]
