---
title: Research — real (VIN-verified) mileage vs claimed mileage
type: research
status: Partly implemented (Option 1)
updated: 2026-07-17
---

> **Update (2026-07-17):** Option 1 shipped as **B21a** — `valuation/mileage-risk.ts` adds soft red-flags
> `unverified_bargain` (big discount + no VIN verification) and `suspicious_low_mileage` (very low km for
> age); `risk.vinChecked` now read from `/info` `checkedVin.isChecked`. This *flags + dampens* traps
> (score ×0.8), it does not eliminate them — the real figure (Options 2/3) is still open (B21b).


# Real mileage (VIN check) vs the claimed odometer

> Problem the operator hit: a listing's **claimed** mileage can be a rolled-back odometer. Our
> mileage-aware valuation ([[profitability-definition]], M1/M2) trusts the source `raceInt`, so a
> fraud looks like a jackpot. Related: [[why-no-opportunities]], red-flags.

## The motivating case

Hyundai Sonata 2013, `auto_id=40143820`, **claimed** mileage **181k km**, asking $4 999 → our
valuation: discount **44.55%**, `lastScore = 1` (a top "deal"). The description is glowing ("на
впевненому ходу, технічно в гарному стані…"). But AUTO.RIA's "Перевірено AUTO.RIA по VIN-коду" shows
**real mileage ≈ 595k km**. At the real mileage this is *not* a deal — the huge discount is exactly the
tell of a rolled-back odometer. We currently can't see this, so we'd alert on a trap.

Why the cheap plausibility check won't catch it: 181k on a 2013 car ≈ 14k/yr — perfectly plausible; the
real 595k ≈ 45k/yr. Plausibility alone can't distinguish them. **The VIN check is the real signal.**

## What the AUTO.RIA API exposes (from the REST API docs)

- `/info` returns **`checkedVin`**: `{ isChecked, isShow, linkToReport: "/vin-check/auto/<id>/" }` — a
  boolean + a **link** to the report, not the structured data.
- We already map `haveInfotechReport` → `hasVinReport` (used as a soft red-flag `no_vin_report`).
- **The structured archival mileage number is NOT in `/info`.** It lives on the VIN-check report page
  behind `linkToReport`.

**Conclusion:** via the documented free API we get *whether* a check exists + a link, but **not** the
real-mileage figure. Getting the number needs one of the options below.

## Options to investigate (future)

1. **Cheap, API-only — use the flags we already get.** Treat claimed mileage as *unverified*: when
   `checkedVin.isChecked`/`hasVinReport` is false, lower confidence and/or add a soft red-flag,
   especially when a *large discount coincides with a low claimed mileage for the age* (the rollback
   signature). Doesn't get the real number, but stops trusting an unverified odometer blindly. Fits the
   red-flags model and spec 002 (a learnable weight).
2. **Dedicated VIN-report API.** Check whether developers.ria.com offers a separate "перевірка авто" /
   infotech product that returns structured history (incl. real mileage) — likely **paid** and/or
   rate-limited. If it exists, add it behind the `ListingSource` port as an opt-in enrichment for
   *candidates only* (budget-aware — never for every listing).
3. **Scrape the report page** (`linkToReport`) — allowed by the constitution **only** behind the source
   port, for a genuinely missing field, respecting ToS + budget. Last resort; brittle.

## Recommendation (when picked up)

Start with **(1)** — it's free, immediately reduces false jackpots, and gives spec-002 learning a real
signal ("unverified low mileage + big discount" → historically bad outcomes). Investigate **(2)** for
the actual number; keep **(3)** as a fallback. Only enrich *candidates* (post-scoring shortlist), never
every listing, to respect the ~30 req/hr budget.

## Related
- [[profitability-definition]] · [[why-no-opportunities]] · [[backlog]] · spec 002 (learnable weight)
