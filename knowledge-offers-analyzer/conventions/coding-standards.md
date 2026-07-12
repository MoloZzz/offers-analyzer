---
title: Coding standards & conventions
type: convention
updated: 2026-07-12
---

# Coding standards & conventions

> How we write code in this repo. Record a convention here the moment it's agreed — future agents follow this note, not their defaults.

## Spec-first (non-negotiable)

Features go through Spec-Driven Development before implementation: `/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`. No non-trivial feature is coded without a spec under `.specify/`. See [[environment-setup]] and [[specs/README]].

## NestJS patterns

_TODO: module structure, DI conventions, DTO + validation approach, error handling, config module usage._

## Testing

_TODO: unit vs integration split, naming, coverage expectations. Run test/build/lint commands through RTK (see [[environment-setup]] and `../.claude/RTK.md`)._

## Style & tooling

_TODO: linter/formatter (ESLint/Prettier), commit conventions, branch naming._

## Related

- [[00-INDEX]]
- [[overview]]
- [[environment-setup]]
