---
title: Offers Analyzer — Knowledge Base Index
type: moc
updated: 2026-07-18
---

# 🧠 Offers Analyzer — Knowledge Base (Second Brain)

**This is the single entry point. Any agent working on this project reads this file first and navigates the project through this vault — not by blindly grepping the codebase.**

The code is the *how*. This vault is the *what* and *why*: architecture, domain language, decisions, conventions, and operations. It is the project's memory. Keep it current (see [[vault-protocol]]).

## 🚦 Start here (agent navigation)

1. Read this index to locate the right area.
2. Open the relevant Map-of-Content (MOC) below.
3. Only then open source files, guided by what the notes point to.
4. After making changes, **update the affected notes** — this is mandatory, not optional. See [[vault-protocol]].

## 🗺️ Maps of Content

- **Architecture** → [[overview|Architecture overview]] — modules, data flow, entities, boundaries.
- **Domain** → [[glossary|Domain glossary]] — ubiquitous language, business rules of the offers domain.
- **Decisions** → [[decisions/README|Decision log (ADRs)]] — why things are the way they are.
- **Conventions** → [[coding-standards|Coding standards]] — NestJS patterns, testing, style.
- **Operations** → [[environment-setup|Environment setup]] — tooling (RTK, Spec Kit), env, runbooks.
- **Specs (SDD)** → [[specs/README|Feature specs index]] — links to Spec Kit artifacts under `.specify/`.
- **Business (plain language)** → [[how-it-works|How it works & how we score]] — for non-technical stakeholders: data collection + profitability scoring, in simple words.
- **Research** → [[monitoring-approaches|Monitoring approach]] · [[profitability-definition|Defining "profitable"]] · [[profitability-methods-coverage|Methods coverage & the ML question]] · [[why-no-opportunities|Reaching non-zero opportunities]] · [[vin-real-mileage|Real vs claimed mileage]] · [[when-to-alert|When to alert (interestingness & relists)]] · [[explainability-gaps|Explainability gaps]] · [[alternative-sources|Alternative listing sources]] — investigations behind the decisions.

## 🗃️ Context zone (decoupled — read for background, not part of this graph)

Goals, session logs, and drafts live under `context/` (path reference, deliberately **not** a graph link). Read `context/goals.md` and the latest `context/log/*` at session start, then navigate here. Rules: `context/README.md`. Durable facts get **promoted** out of `context/` into the curated notes above.

## 🔗 Related project infrastructure

- `.specify/` — Spec-Driven Development (Spec Kit): constitution, templates, scripts. Workflow: `/speckit-constitution → /speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`.
- `.claude/RTK.md` — RTK (token-saving command wrapper) usage rules.
- `../CLAUDE.md` — the enforced operating rules that bind this vault, SDD, and RTK together.

## 📌 Project one-liner

> Offers Analyzer — an **operator's (перекуп's) assistant** that monitors AUTO.RIA listings and ranks them by the **probability of profitable resale** (composite Total Deal Score; price below fair value dominant). See [[0006-operator-profit-vision|ADR-0006]].

## Status

Project is at bootstrap stage — most notes below are skeletons with `TODO` markers. Fill them as the codebase grows; never let a note go stale relative to the code.
