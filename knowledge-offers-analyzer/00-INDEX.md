---
title: Offers Analyzer - Knowledge Base Index
type: moc
updated: 2026-08-05
---

# Offers Analyzer Knowledge Base

**This is the curated vault entry point. Start with the short context handoff, then use this map
to reach the source of truth for the task.**

The code is the how. This vault owns product intent, requirements, decisions, architecture,
conventions, and operations. Keep it current under [[vault-protocol]].

## Start here

1. For session background, read context/goals.md, context/CURRENT.md, and the latest dated
   context/log/ file.
2. Read this index and choose the product or technical area below.
3. Start from the smallest authoritative note, then widen only as needed: brief, map, targeted
   note, full spec/ADR/code.
4. After a change, update the durable source of truth and record the task in a dated context log.

## Product and delivery

- [[vision-and-goals|Product vision and goals]] - user, outcome, scope, non-goals, and product test.
- [[requirements|Product requirements]] - durable product obligations and release gates.
- [[Roadmap & Status|Roadmap & Status]] - canonical priority, phase, blocker, and exit-evidence summary.
- [[invariants|Architecture invariants]] - properties that must survive implementation changes.

## Maps of Content

- **Architecture** -> [[overview|Architecture overview]] - modules, data flow, entities, boundaries.
- **Domain** -> [[glossary|Domain glossary]] - ubiquitous language and business rules.
- **Decisions** -> [[decisions/README|Decision log (ADRs)]] - why things are the way they are.
- **Conventions** -> [[coding-standards|Coding standards]] - NestJS patterns, testing, and style;
  [[delegation|Delegation to subagents]] - when to delegate, model tiers, and the brief contract.
- **Operations** -> [[environment-setup|Environment setup]] - tooling, environment, and runbooks.
- **Specs (SDD)** -> [[specs/README|Feature specs index]] - repo-root feature specs and Spec Kit workflow.
- **Business explanation** -> [[how-it-works|How it works and how we score]] - non-technical narrative.
- **Research** -> [[monitoring-approaches|Monitoring approach]], [[profitability-definition]],
  [[profitability-methods-coverage]], [[why-no-opportunities]], [[vin-real-mileage]],
  [[when-to-alert]], [[explainability-gaps]], and [[alternative-sources]].

## Context zone

Goals, current handoff, session logs, drafts, and the retained historical queue live under
context/. They are deliberately outside the curated navigation graph. Read the short handoff at
session start, but promote durable facts into the curated notes above. Rules: context/README.md.

## Project infrastructure

- [[Welcome]] - minimal onboarding page for a newly opened vault.
- .specify/ - Spec Kit constitution, templates, scripts, and workflows.
- .claude/RTK.md - RTK command-wrapper rules.
- ../CLAUDE.md - repository operating policy.
- ../AGENTS.md - compact entry point for agent runtimes.

## Project one-liner

> Offers Analyzer is an operator's assistant that monitors AUTO.RIA listings and ranks them by the
> probability of profitable resale. Price below fair value remains dominant; the product is not a
> general market appraiser.

## Status

The project is beyond bootstrap. Do not infer current priority from a TODO marker or an old
backlog entry; use [[Roadmap & Status|Roadmap & Status]], then the relevant ADR and feature spec.
