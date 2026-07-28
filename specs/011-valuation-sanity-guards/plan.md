# Implementation Plan: Valuation Sanity Guards

**Spec**: [spec.md](spec.md) | **Created**: 2026-07-29 | **Status**: Ready

## Summary

Prefer AUTO.RIA's median over the interquartile mean and stop granting a large positive value adjustment to an unverified or very old car's claimed mileage. This corrects false high-discount alerts without a new API request.

## Technical Context

- **Language**: TypeScript / NestJS
- **Primary code**: AUTO.RIA adapter and pure mileage valuation
- **Storage/migrations**: none
- **Testing**: Undici MockAgent contract test; pure unit tests
- **Constraints**: official API only; no new request type; one cache miss per active cohort is permitted after deployment; existing ParameterSet maximum remains authoritative when lower

## Constitution Check

- **I**: Spec, plan, task list, and regression tests precede code.
- **III**: Two small, local rules; no new abstraction or entity.
- **IV**: API response handling stays isolated in the AUTO.RIA adapter.
- **V**: No additional source calls or budget consumption.
- **VI**: Contract and pure valuation paths are covered without live API access.

## Design Decisions

1. Percentile `50.0` is the robust central value. `interQuartileMean`, then arithmetic mean, are compatibility fallbacks.
2. A low claimed odometer can only increase fair value if a report exists. A high claimed odometer can still decrease fair value conservatively.
3. Age 15+ limits a verified positive uplift to 5%, because age-based mileage becomes weak evidence on older cars.
4. The fair-value cache key is estimator-versioned while snapshot cohort identity stays unchanged, so the new median takes effect immediately without splitting SPEC-004 history.

## File Structure

```text
src/modules/sources/auto-ria/auto-ria.source.ts
src/modules/valuation/mileage.ts
test/contract/auto-ria.spec.ts
test/unit/mileage.spec.ts
```
