# Feature Specification: Telegram daily-limit control

**Feature Branch**: `014-telegram-monitoring-control`  
**Created**: 2026-08-02  
**Status**: Ready

## User Scenarios & Testing

### User Story 1 - Disable the daily request limit from Telegram (Priority: P1)

As an authorized operator, I can disable the daily AUTO.RIA request limit from Telegram so
scheduled polling, sweeps, and on-demand source requests continue without the daily cutoff.

**Independent Test**: Given an active AUTO.RIA source, an authorized `/daily_limit off` command
persists the override, and a request over the daily allocation is still admitted while the monthly
pool remains enforced.

### User Story 2 - Re-enable the daily request limit from Telegram (Priority: P1)

As an authorized operator, I can restore daily AUTO.RIA request enforcement from Telegram.

**Independent Test**: Given a disabled daily limit, an authorized `/daily_limit on` command restores
the persisted setting and daily cutoffs apply again.

### User Story 3 - Keep control private and observable (Priority: P1)

As an operator, I can inspect the monitoring state, while non-admin Telegram users cannot change
it.

**Independent Test**: An unlisted Telegram chat receives no state-changing behavior; an authorized
`/monitoring` command reports paused or active state.

## Requirements

- **FR-1401**: The system MUST persist a source-level daily-limit-enabled state in PostgreSQL.
- **FR-1402**: When disabled, the daily cutoff and daily exhaustion checks MUST be bypassed while
  monthly pool exhaustion remains enforced.
- **FR-1403**: `/daily_limit off`, `/daily_limit on`, and `/daily_limit status` MUST be restricted to configured Telegram
  admin chat IDs.
- **FR-1404**: The commands MUST be idempotent and report the resulting state.
- **FR-1405**: The default state for a source with no control row MUST have daily enforcement on.
- **FR-1407**: Existing notification commands and profile configuration behavior MUST remain
  unchanged.

## Configuration

`TELEGRAM_ADMIN_CHAT_IDS` is a comma-separated list of Telegram chat IDs. An empty value disables
the administrative command rather than granting access to everyone.

## Out of Scope

- Controlling only one search profile.
- Automatic expiry or scheduled re-enable.
- A web admin UI or changing the existing budget allocation policy.
