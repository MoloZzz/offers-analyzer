---
summary: Knowledge base hub: navigation through notes — business, architecture, sources, decisions, and plans.
---
# Financial Transactions Aggregator — Knowledge Base

Personal finance tracker: collects card transactions and crypto deposits,
can link a hryvnia card outflow to a crypto inflow (P2P purchases),
and exports to Google Sheets. Stack: **NestJS + TypeORM + PostgreSQL**.

> [!info] Status
> The single source of truth for status is [[Roadmap & Status]]. Status is not duplicated here.

## Business
- [[Vision & Goals]] — what it is, for whom, why, and boundaries
- [[Requirements]] — functional requirements
- [[Card↔Crypto Matching]] — the main domain feature (P2P matching)
- [[Glossary]] — terminology

## Architecture
- [[Architecture Overview]] — layers and data flow (diagram)
- [[Invariants]] — non-negotiable rules
- [[Data Model]] — entities and schema (ERD)
- [[Sync Engine]] — how data is fetched and stored
- [[Providers]] — source contract
- [[Events & Export]] — event + Google Sheets

## Data sources
- [[Monobank]] — API, limits, and pitfalls
- [[Crypto CSV]] — Binance P2P + deposit
- [[Bank CSV]] — Privat and others

## Planning
- [[Analytics & Control — Backlog]] — analytics and control backlog, plans in `Plans/`

## Process and decisions
- [[Roadmap & Status]] — sequence and what is already complete
- [[Decision Log]] — key decisions and why
