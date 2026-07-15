---
title: ADR-0002 — Monitor AUTO.RIA via the official API, narrow niche on free tier
type: decision
status: Accepted
updated: 2026-07-12
---

# ADR-0002 — Monitor AUTO.RIA via the official API (narrow niche, free tier)

**Status:** Accepted
**Date:** 2026-07-12

## Context

We must ingest auto.ria listings to detect profitable ones. Options were official API, headless scraping, or hybrid. auto.ria offers a first-party REST API (search, listing info, **average price**) with a free tier limited to ~30 requests/hour; paid packages raise it. Full analysis: [[monitoring-approaches]].

## Decision

1. **Official API only for v1.** No scraping. Scraping is deferred and, if ever needed, must sit behind the source-adapter port for a single missing field.
2. **Narrow niche on the free tier.** v1 monitors a few configured search profiles (region + make/models + price band), not the whole site — sized to fit ~30 req/hour.
3. **Source-adapter port from day one.** A `ListingSource` interface abstracts AUTO.RIA so other sites can be added later without touching the core.
4. **Store listings and price history from day one**, to enable own-statistics valuation and price-drop detection later.

## Consequences

**Positive:** legal & stable ingestion; free access to the average-price benchmark that underpins profitability; fastest path to v1; multi-source designed in.

**Negative / to maintain:** hard 30/hr budget forces request budgeting, dedup, caching of dictionaries, and a rate-limited scheduler; widening coverage means buying a paid package. The profitability definition itself is still **Proposed** — see [[profitability-definition]].

## Related

- [[decisions/README]] · [[monitoring-approaches]] · [[profitability-definition]] · [[overview]] · [[alternative-sources]]
