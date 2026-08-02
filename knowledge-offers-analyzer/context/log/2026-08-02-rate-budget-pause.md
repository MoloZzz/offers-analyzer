---
title: Rate-budget pause investigation
type: context-log
date: 2026-08-02
updated: 2026-08-02
---

# Rate-budget pause investigation

## Finding

`RateBudgetService` has no global admin pause command or runtime pause setting. Telegram
`/stop` and `/mute` affect notifications only. To pause AUTO.RIA polling without changing code,
the operator can set every profile's `enabled` value to `false` in the configured
`SEARCH_PROFILES_FILE` (normally `config/search-profiles.json`) and restart the application.
`ProfilesService` syncs that flag on bootstrap, and polling/sweep services consume only enabled
profiles. Restore the previous flags and restart to resume.

## Caveat

Changing `RATE_BUDGET_*` values or muting Telegram is not a true pause: the scheduler still runs
and may make source requests. Existing in-flight work may finish during shutdown/restart.

## Follow-up implementation

SPEC-014 adds durable admin-only `/daily_limit off`, `/daily_limit on`, and `/daily_limit status`
commands backed by `source_controls`. The override bypasses only daily cutoff/exhaustion checks;
the monthly pool remains enforced. `TELEGRAM_ADMIN_CHAT_IDS` configures access.
