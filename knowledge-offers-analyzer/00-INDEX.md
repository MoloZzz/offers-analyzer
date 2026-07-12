---
title: Offers Analyzer — Knowledge Base Index
type: moc
updated: 2026-07-12
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

## 🔗 Related project infrastructure

- `.specify/` — Spec-Driven Development (Spec Kit): constitution, templates, scripts. Workflow: `/speckit-constitution → /speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`.
- `.claude/RTK.md` — RTK (token-saving command wrapper) usage rules.
- `../CLAUDE.md` — the enforced operating rules that bind this vault, SDD, and RTK together.

## 📌 Project one-liner

> Offers Analyzer — a NestJS service that ingests and analyzes offers. _(Refine this line once the domain is defined; keep it to one sentence.)_

## Status

Project is at bootstrap stage — most notes below are skeletons with `TODO` markers. Fill them as the codebase grows; never let a note go stale relative to the code.
