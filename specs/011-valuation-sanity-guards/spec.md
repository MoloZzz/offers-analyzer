# Feature Specification: Valuation Sanity Guards

**Feature Branch**: `011-valuation-sanity-guards`
**Created**: 2026-07-29
**Status**: Ready
**Input**: Operator found an Opel Astra 2004, 168k km, asking $3,100 that was scored 10/10 against a $4,868 fair value while AUTO.RIA showed $3,343–$3,694.

## User Scenarios & Testing

### User Story 1 - Median-based market anchor (Priority: P1)

The operator sees an alert based on the typical comparable price rather than a higher middle-band mean.

**Independent Test**: Given an AUTO.RIA average response containing both a median and an interquartile mean, the stored fair-value base is the median.

**Acceptance Scenarios**:

1. **Given** a response with median $3,600 and interquartile mean $4,056, **When** it is used as a benchmark, **Then** fair-value base is $3,600.
2. **Given** a legacy response without a median, **When** it is used, **Then** the interquartile mean remains the fallback.

### User Story 2 - Do not reward unverified claimed mileage (Priority: P1)

The operator is not told an old car is a bargain merely because its unverified odometer is lower than an age-based assumption.

**Independent Test**: An unverified low-mileage listing has no positive mileage uplift; a high-mileage listing can still receive a downward correction.

**Acceptance Scenarios**:

1. **Given** a listing with no AUTO.RIA VIN evidence, **When** its claimed mileage would increase fair value, **Then** the adjustment is zero.
2. **Given** a VIN-evidenced car aged 15+ years, **When** claimed mileage would increase fair value, **Then** the uplift is no more than 5%.

### Edge Cases

- A mileage-banded benchmark remains like-for-like and receives no analytical correction.
- Missing or unusable mileage remains a no-op.

## Requirements

- **FR-001**: The AUTO.RIA adapter MUST prefer percentile `50.0` (median) over `interQuartileMean`; arithmetic mean remains last fallback.
- **FR-002**: A non-mileage-banded benchmark MUST NOT receive a positive claimed-mileage adjustment unless AUTO.RIA exposes VIN evidence (`hasVinReport` or `checkedVin.isChecked`).
- **FR-003**: For a VIN-evidenced listing aged 15 years or more, positive mileage uplift MUST be capped at 5%; a configured lower cap wins.
- **FR-004**: The change MUST not add a request type, database schema, or automatic score activation. It MAY reload each active cohort once after deployment so a one-day cache cannot serve the prior estimator.

## Success Criteria

- **SC-001**: A `$4,056` interquartile mean and `$3,600` median select `$3,600` as the fair-value base.
- **SC-002**: An unverified 22-year-old vehicle at 168k km cannot receive a positive analytical mileage uplift.
- **SC-003**: A VIN-evidenced 22-year-old vehicle's positive uplift cannot exceed 5%.

## Assumptions

- `checkedVin.isChecked` and `haveInfotechReport` are evidence of a report, not a substitute for its unavailable structured mileage history.
- This is a conservative price-core guard; generation/trim-specific cohorts remain future work.
