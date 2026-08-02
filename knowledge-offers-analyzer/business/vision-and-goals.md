---
title: Product vision and goals
type: business
updated: 2026-08-02
summary: Operator-profit product vision, v1 scope, non-goals, and operator decision test.
---

# Product vision and goals

> Canonical statement of product intent. ADRs own durable trade-offs; this note states the outcome they collectively serve.

## Product one-liner

Offers Analyzer is an operator's assistant that monitors AUTO.RIA listings and ranks them by the
probability that a resale will bring the operator profit. It answers “is this worth calling about
now?”, not “what is this car worth?”.

## User and job

The primary user is a car-resale operator (perekuyp). The product helps that operator notice,
prioritize, and understand potentially profitable listings quickly enough to act before the
opportunity disappears.

## What counts as a deal

A deal is not merely a listing below a market benchmark. Expected resale profit is led by price
below fair value and shaped by liquidity, repair risk, seller motivation, positive condition
evidence, and confidence in the available data. The Total Deal Score must remain explainable and
must preserve price as the dominant input.

The staged v1 rollout begins with the price core; survivorship correction and the first factor
activation may enter live behavior only through the evidence-gated process. See
[[0010-defer-factor-activation-until-k|ADR-0010]] and
[[0011-evidence-gated-scoring-rollout|ADR-0011]].

## v1 goals

- Find and rank listings in configured, narrow search profiles without spending beyond the approved
  AUTO.RIA request budget.
- Send timely, understandable Telegram alerts that help an operator decide whether to investigate.
- Avoid expensive false positives, especially listings with hard disqualifiers, weak market evidence,
  or unverified mileage claims.
- Preserve enough outcome and explanation evidence to improve the system conservatively over time.

## Scope boundaries

- AUTO.RIA is accessed through its official API only; scraping is not a v1 fallback.
- Search profiles, thresholds, dealer policy, and currency are operator-controlled configuration,
  not hardcoded product commitments.
- The product is not a general market-price appraiser.
- A paid API tier, wider market coverage, additional sources, an ML resale model, and computer
  vision remain later work. They require the evidence and operating conditions documented in
  [[profitability-methods-coverage]].

## Product tests

Before accepting a feature or scoring change, ask:

1. Would a skilled resale operator use this when deciding whether to buy a car?
2. Does it improve profitable-resale decision quality rather than abstract price estimation alone?
3. Can the operator understand why the system reached its conclusion?

## Authority and related notes

- [[0006-operator-profit-vision|ADR-0006]] is the authoritative decision behind this framing.
- [[requirements|Product requirements]] turns the vision into durable product obligations.
- [[Roadmap & Status|Roadmap & Status]] is the canonical high-level delivery status.
- [[how-it-works|How the system works]] explains the product in non-technical language.
