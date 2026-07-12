# Contract — Telegram bot commands & alert format

The user surface. Delivered via the `Notifier` port (`nestjs-telegraf` adapter).

## Commands

| Command | Effect |
|---|---|
| `/start` | Register the chat as a Subscriber (state `active`); short intro. |
| `/subscribe [profile]` | Follow all niches, or a named profile. |
| `/unsubscribe` | Set state `unsubscribed` (no messages). |
| `/mute [duration]` | Set state `muted` (optionally timed). |
| `/profiles` | List active niches being watched. |
| `/help` | Show commands. |

Management of profile *definitions* (create/edit thresholds, dealer policy, currency) is admin-side
config in v1; end-user control is subscribe/mute. (Profile CRUD UI is out of v1 scope.)

## Alert message format (Opportunity)

Every alert MUST include (FR-007, SC-002) and end with the AUTO.RIA backlink (ToS):

```text
🚗 <Make Model>, <year>, <mileage> тис. км — <region>
Ціна: <asking> <cur>   |   Ринкова (сер.): <fairValue> <cur>
Знижка: <discountPct>%   |   Впевненість: <confidence> (<sampleSize> оголошень)
Перевірки: <passed red-flags summary>
Продавець: <private|dealer>
🔗 <AUTO.RIA listing url>
```

## Price-drop message (optional event, FR-009)

```text
📉 Ціна знижена: <Make Model>, <year>
Було <old> → стало <new> <cur> (−<dropPct>%)   |   Тепер знижка <discountPct>% від ринку
🔗 <AUTO.RIA listing url>
```

## Rules

- Idempotency: one message per `(subscriber, opportunity|price_drop)` via `Notification.dedupKey`.
- Muted/unsubscribed subscribers receive nothing.
- Suspiciously large discounts are flagged as risky, not presented as jackpots (FR-006, US3).
