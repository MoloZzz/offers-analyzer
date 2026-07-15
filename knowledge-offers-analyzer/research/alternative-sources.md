---
title: Research — alternative listing sources beyond AUTO.RIA
type: research
status: Survey (no decision)
updated: 2026-07-13
---

# Research — alternative listing sources beyond AUTO.RIA

> Which other sites can feed the "find profitable cars" goal, and — crucially — **how** their data is reachable. Companion to [[monitoring-approaches]]; sources plug into the `ListingSource` port from [[0002-monitoring-via-official-api|ADR-0002]]. This is a survey, not a decision.

## Framing — profitability has two arbitrage modes

The business goal ("buy meaningfully below fair value") splits into two modes, and different sources serve each:

- **Mode A — local mispricing:** buy cheap in UA, resell in UA. Needs the *same* pool of listings as AUTO.RIA (wider coverage + cross-check of the fair-price benchmark).
- **Mode B — import arbitrage:** buy at auction / in the EU, clear customs, resell in UA. The dominant margin driver in the Ukrainian market (large share of cars are imports). Needs auction / EU-marketplace data.

## The access problem (read this first)

AUTO.RIA is special: it offers a **legal, first-party read API**. Almost none of the alternatives do. Most give only *write* (dealer listing) APIs or no public API at all, so their data is reachable only via **paid third-party aggregator APIs** or **scraping**. That directly tensions the v1 "official API only, no scraping" stance of [[0002-monitoring-via-official-api|ADR-0002]]. Expanding sources is therefore a **data-access / legal** problem, not a code problem — the port already exists.

Access legend: ✅ legal read API · ⚠️ third-party/paid API or gray-area · ❌ scraping-only / closed.

## Mode A — Ukrainian domestic classifieds

| Source | Rationale | Access |
|---|---|---|
| **OLX.ua** | Highest value. #2 on the market; RIA + OLX ≈ **82%** of all car deals via classifieds. Essential second source. | ⚠️ No public listings read-API; partner/seller integration is write-oriented. Reading is gray-area. |
| **RIA.com** (general board) | Medium. Same holding as AUTO.RIA, partly duplicates it. | ⚠️/✅ Same `developers.ria.com` ecosystem. |
| Small boards (auto.ria.biz, autobazar, promo boards) | Low. Small volume, many dupes/clones. | ❌ Mostly scraping. |

## Mode B — import arbitrage (auctions + EU marketplaces)

| Source | What it is | Access |
|---|---|---|
| **Copart, IAAI** | US insurance/salvage auctions — the main import feeder into UA. | ⚠️ Official APIs are member/dealer-gated; practical access via paid third-party APIs (auctionsapi.com, apicars.auction, etc.). |
| **bid.cars / BidFax** | Aggregators of Copart/IAAI lot history, aimed at PL/UA importers. | ❌/⚠️ Mostly parsing/scraping, not clean API. |
| **OpenLane.eu** | B2B used-car auction in Europe (for traders). | ❌ Closed B2B access. |
| **mobile.de** | Germany's largest board — baseline EU price benchmark. | ⚠️ Official API is effectively write-only (dealers); reads via third-party parsers. |
| **AutoScout24** | Largest pan-EU board (8 countries, 770k+ lots). | ❌ Official API = listing creation only, **no search/read**; data via third-party scrapers. |
| **Manheim** | Largest US wholesale auction. | ❌ Closed, dealer-only. |

## Reference / valuation data (not listings, but feed "fair value + risk")

- **Carfax / AutoCheck** — VIN history (US).
- **BidFax** — damage/auction history for imports.
- **RIA `average_price`** — first-party local fair-value benchmark, already used (see [[monitoring-approaches]]).

## Rational sequencing (value ÷ effort)

1. **OLX.ua** — biggest payoff for Mode A (second-largest market); investigate partner access.
2. **Third-party Copart/IAAI APIs** — unlock Mode B, but paid and shift the product toward "import-deal valuation" rather than local monitoring.
3. **mobile.de / AutoScout24** — as an EU price benchmark, not a lead source.

## Open questions

- Does OLX offer any sanctioned read path, or is Mode A expansion blocked by ToS?
- Is Mode B in scope for this product at all, or a separate product? (It changes the domain model — customs, shipping, damage grading.)
- If a paid auction API is used, does that reopen the "no scraping" line in [[0002-monitoring-via-official-api|ADR-0002]] enough to warrant a new ADR?

## Sources

- CBR study — RIA + OLX > 80% of deals: biz.nv.ua (2024)
- marketer.ua — top UA auto-classified sites
- AutoScout24 Listing Creation API docs (write-only)
- Copart/IAAI third-party APIs — auctionsapi.com, apicars.auction
- bid.cars / BidFax; OpenLane.eu

## Related

- [[00-INDEX]] · [[monitoring-approaches]] · [[0002-monitoring-via-official-api|ADR-0002]] · [[profitability-definition]] · [[overview]]
