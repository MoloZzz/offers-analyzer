---
summary: Key architectural decisions and why, in decision format: decision, reason, consequence.
---
# Decision Log

Key decisions and why. Format: decision → reason / consequence.

## Architecture and model
- **Single-user app, no `userId`.** This is a personal tool, not a platform.
  Dedupe = `UNIQUE(source, externalId)`. → [[Invariants]] #4
- **`amount` = `numeric(38,0)` ↔ `BigInt`** (not `bigint`, not float). Crypto with 18
  decimals (wei) overflows `bigint` (max ~9.2·10^18); `numeric(38,0)` is safe, a shared
  type for fiat and crypto. → [[Invariants]] #1
- **Store `decimals` (scale) together with the amount.** Minor units alone are not
  self-describing (UAH=2, JPY=0, BTC=8, ETH=18) — otherwise the display loses scale.
- **Flat enum `type`; P2P marker in `metadata`.** Simplicity by default; no separate
  `p2p_buy` is introduced. (confirmed by the user)
- **CSV `externalId` = deterministic row hash.** CSV has no stable id; a hash of stable
  fields + `UNIQUE(source, externalId)` gives idempotency.
- **Crypto trade = one asset leg + `tradeRef` in metadata.** We do not build FIFO/lot-
  tracking now, but we also do not make it impossible. → [[Card↔Crypto Matching]]
- **Account = separate `accounts` table + FK** (not just a text `accountRef`). We need
  to show “card ••1234 / UAH”, group, and filter. The migration backfills existing rows
  from `metadata.accountId`. → [[Data Model]]

## Sources / sync
- **Live credentials through `.env`; full backfill = whole history** (user chooses).
  Secrets are not in code/Git.
- **Monobank: newest-first + stop at 400.** 400 = the date range before the account
  existed → history boundary; this gives “whole history” without crashes and without an
  opening date. → [[Monobank]]
- **Overlap windows on the boundary second** (instead of a 1-second gap) — no transaction
  is missed, duplicates are removed by dedupe.
- **Incremental sync from watermark** (`max(bookedAt)` per source). A daily run pulls
  only new data instead of a full backfill every time. The contract stayed thin:
  `fetch(sinceSec?)`, watermark is computed by the sync layer. → [[Sync Engine]]
- **`currencyCode` = account currency, not operation currency.** `item.amount` is in the
  account currency, and `item.currencyCode` is the operation currency; marking the amount
  as the operation sum is a bad label for cross-currency transfers. Operation
  amount/currency → in `metadata`. Existing rows are fixed by SQL propagation from
  `accounts` (amount was correct, only the label was broken). → [[Monobank]]
- **Crypto CSV = two separate providers, not one with format detection.**
  `binance_p2p_csv` and `binance_deposit_csv` are different `source`s, different files,
  different env paths (`BINANCE_P2P_CSV_PATH`/`BINANCE_DEPOSIT_CSV_PATH`). Simpler and
  clearer than auto-detecting the format from the file contents. → [[Crypto CSV]]
- **P2P order → one row (crypto leg only), fiat only in `metadata`.** We do not create
  a second (“fiat”) row for a P2P order: the fiat side does not move through any of our
  source accounts (cash/another bank outside the system), and `TransactionType` does not
  model a fiat movement without account context. Rate/fiat amount go into `metadata`
  (`fiatAmountMinor` as a string in minor units, not BigInt/float — jsonb does not hold
  BigInt) for step 5. `metadata.tradeRef` = order number (self-linking, useful for future
  grouping). → [[Crypto CSV]], [[Card↔Crypto Matching]]
- **`externalId` for CSV is always a hash via `buildExternalId`, even when there is a
  native id.** Order Number and TXID are stable, but we hash them the same way for one
  externalId scheme across all CSV providers and to survive future column-format changes.
  → [[Providers]]
- **Crypto scale = a table of assumptions in code** (`providers/binance/asset.ts`), not
  from CSV. Binance CSV does not contain canonical asset decimals. The table
  (`USDT`/`USDC`=6, `BTC`=8, `ETH`/`BUSD`=18, fallback 8) is a documented assumption;
  CSV numbers with trailing zeros (`320.00000000`) are trimmed as strings
  (`trimTrailingZeroFraction`) before `parseDecimalToMinor` — float never appears, and
  true precision loss (non-zero digits beyond `decimals`) still throws an exception.
  → [[Crypto CSV]]
- **CSV crypto rows do not have `account`.** There is no “card” concept for Binance CSV;
  `accountId` stays `null` (already allowed by [[Data Model]] for some CSV sources).

## Card↔crypto matching (step 5)
- **1-to-1 per card, winner = min |Δsum|, then min |Δtime|.** One card debit funds at
  most one crypto purchase; among valid candidates the best one is chosen deterministically,
  independent of candidate order. → [[Card↔Crypto Matching]]
- **The card debit must precede the crypto inflow within the window**
  (`bookedAt ∈ [cryptoTime – window, cryptoTime]`), not vice versa and not outside the
  window. P2P: money leaves the card to the seller → crypto arrives later.
- **`tolerance` defaults to 0 (exact amount match), `window` defaults to 7200s (2 hours).**
  Both come from env (`MATCH_TOLERANCE_MINOR`, `MATCH_WINDOW_SEC`; canonical values —
  [[Card↔Crypto Matching]]), not hardcoded, so we can tune for real patterns without code releases.
- **`chooseCardMatch` is a pure function (no DB, no I/O).** All selection logic is
  isolated from persistence so we can unit-test window/amount/tie-break without Postgres.
  `MatchingService` is only a thin I/O layer around it (candidate selection, upsert, 1-to-1).
- **Matching is a separate `npm run match`, not part of `sync`.** Post-processing starts
  after both sources (Monobank + Binance P2P CSV) are already in the DB; providers and
  `SyncService` do not know about matching. → [[Invariants]] #5
- **Upsert by `cryptoTxId` (`UNIQUE`) with a conditional `WHERE "manualOverride" = false`
  in `ON CONFLICT ... DO UPDATE`.** Re-running is idempotent, but a row that the user
  already manually confirmed/relinked is never touched again — the condition lives in SQL
  itself (not in JS pre-checks before writing), with no race window.
- **A debit already linked to its “own” (non-override) purchase is temporarily removed
  from the candidate pool before this leg is recomputed.** Otherwise the algorithm would
  see its own previous selection as “occupied” and never re-evaluate the same debit —
  breaking idempotency. Debits occupied by other already-resolved purchases or
  `manualOverride` rows remain blocked.

## Infrastructure
- **Single `DATABASE_URL` instead of a `DB_HOST/PORT/...` set** (user choice).
- **TypeORM 1.0, PostgreSQL 16.** `gen_random_uuid()` from the core — without
  `pgcrypto`/`uuid-ossp` in migrations.
- **Sheets — batch append on `flush()`, not per-event:** full backfill means thousands
  of events. → [[Events & Export]]
- **Google client through `google-auth-library` + Sheets REST, lighter than full `googleapis`.**
- **`process.exitCode` instead of `process.exit()` in the entrypoint** — removes libuv
  assertions on Windows when handles are still open.

## Process / knowledge base
- **Vault sync is forced through a git pre-commit hook** (`.githooks/pre-commit`,
  `core.hooksPath`): commits touching `backend/src|test` without changes in
  `transaction-analytics/` are blocked; bypass is `SKIP_VAULT_CHECK=1` only for zero-
  knowledge fixes. The hook also blocks duplicate status duplication in `00 — Index.md`
  — the single source of truth for status is [[Roadmap & Status]].
- **`build` writes, `check` never.** The hook invokes only `check`, so regeneration
  cannot dirty the tree it validates (same contract as `prettier --check` vs `--write`).
- **`_gen/*` are not `.md`.** Obsidian indexes only `.md`; a generated note with
  `[[links]]` would always have zero source detection. So `.txt`/`.tsv`/`.json`.
- **Freshness of a note = content digest `rev:`, not a git timestamp.** The hook forces
  code and vault to live in one commit, so `note_ts >= code_ts` is a tautology; we compare
  file hashes in `code:`.
- **`rev-stale` = `error`, not `warn`.** On `warn` the rule is inert: nobody reads
  warnings. A code change under `code:` blocks the commit until the note is reviewed and
  pinned (`vault pin`). Bypass — `SKIP_VAULT_CHECK=1`.
- **Retrieval log and `_retrieval.tsv` baseline live under `_gen/`.** The log must update
  on every `find`; inside `_gen/`, if it became freshness-sensitive, it would make `check`
  unstable. The log is in `.gitignore`; it is local observation, not repository state.
- **`code-map.txt` is a separate artifact, not part of `context.txt`.** It heavily
  overlaps the entire L1 pack and is only needed before editing `backend/src`, so it is
  read on demand.
- **L1 is injected by Claude Code hooks** (`SessionStart`/`SubagentStart` in
  `.claude/settings.json`), not by agent memory. `PostToolUse` on `Read` forces full note
  reading — this is the only way to measure L3→L4 escalation, which the CLI itself cannot see.
- **`CLAUDE.md` is in English; note names and `[[links]]` are not.** The file is in every
  prompt context, and Cyrillic costs about 2× tokens per character; but names are addresses
  for `find`/`show`/`Read`, and a translated address will not resolve.
- **Context budget — 50k per session, measured by `vault ctx`.** A real session profile at
  282k: `CLAUDE.md` + L1 pack together were still <1% of context, while 22% was dead-harness
  injections nobody had ever read. Retrieval was not the tightest spot; the work itself was.
  Hence the canon shifted from “read fewer notes” to “one Roadmap step per session, vault as handover”.
- **`code-map.txt` also covers `tools/vault`, not just `backend/src`.** The profile showed
  ~15k tokens (53% of all `Read` cost) on a full read of the tool itself — the indexer was
  indexing itself. A separate scope in `MAP_SCOPES` is cheaper than any “don’t grep” discipline.
- **Subagent reports must be ≤30 lines, with refs and not full notes.** The rule “pass refs,
  not full note bodies” helped only on input; measurement showed the cost is on output
  (6 subagents, avg 6.6k, max 12.3k report tokens). A report that is more expensive than
  the debugging it supports cancels the delegation session.
- **Harness injections are accounted for separately from agent work.** `task_reminder`
  turned out to be the largest separate unique line (23k tokens across 31 injections —
  it instantly replaces the whole task list), while tool/agent/skill listings are fixed overhead.
  Therefore closed tasks are removed, and ephemeral status lives in [[Roadmap & Status]],
  not in the task list.
- **`vault ctx` reads transcripts outside the repository (`~/.claude/projects`), read-only.**
  The profile needs data that the repo does not contain; the command writes nothing and is
  never invoked from a hook — not because of the `check` contract, but because its cost grows
  with transcript size. Tokens are an estimate from a character heuristic (±15%), not a real
  tokenizer: the relative line counts are trustworthy, absolute numbers are not.
- **The context governor is edge-triggered, not level-triggered.** Budget warnings are
  shown once at each crossed threshold (60/100/150%), not repeatedly: the repeated reminder
  would be the same defect (`task_reminder`, 23k tokens across 31 injections) that the governor
  should have detected. → [[Roadmap & Status]]
- **Governor hooks always fail open.** Broken state, unavailable transcript, malformed JSON
  → return “allowed, silently” and exit 0. `PreToolUse` runs before every `Read` and `Write`,
  so a hook that fails or blocks is worse than a missing hook.
- **Gates fire at tier 2 (100% budget), not always.** Write over an existing file and full
  Read notes are blocked only when the session is already outside budget; until then, silence.
  The veto is named in the refusal itself (Edit; `show` before `Read`), plus `VAULT_CTX_OFF=1`.
  Reading notes is allowed if `show` was used on them in the last 15 minutes — this is a
  legitimate L3→L4 escalation for editing, and the agent never gets stuck in the past.
- **Subagents get a report contract at the start, not a blocking one at the end.**
  `SubagentStop` with decision:block “does not let the subagent stop; it continues working” —
  this allows more tool calls, not a shorter report. Therefore the ≤30 line limit is injected in
  `SubagentStart` (for free, because the hook already exists), and its presence is measured by
  `findings()`. → [[Roadmap & Status]]
- **BUDGET lives in `guard.mjs`, not `ctx.mjs`.** `guard` loads before every `Read` and `Write`,
  so it must not pull the profiler with it; the reporter→governor dependency goes one way only.
  Raw bytes U+0000 in `code.mjs` and `fs.mjs` were replaced with the escape `\0`: ripgrep treated
  these files as binary, so Grep did not work, and the agent had to read them whole.
- **PreCompact skips the peak, not just the compaction.** Compaction is a single event after
  which the saved maximum stops describing the live window: it really shrank. Without replay,
  one session at 280k would have stayed with summaries to the very end, no matter how much
  compaction would have helped; the compaction counter remains only as a record of fact.
- **Product priorities are measured, not merely declared:** `_metrics.tsv` (registry) +
  `vault evidence` (runner) track metrics against the live DB. A trigger fired => we work on the
  plan. Deliberately outside `check`: it reads live data, so it is not in git hooks; output goes
  to gitignored `tools/vault/.evidence.tsv`, because it changes with the data, not with the
  repository. Privacy — two checks (whitelisted columns value//n + value must be a trimmed
  number; the second catches aliased text). Plan 00 knows without metrics: it imports money the
  DB had never seen, so it is not measured by asking the same DB.
- Vault extracted into a reusable package: config.mjs sits below fs.mjs (importing it back would be a cycle), stack knowledge moved behind an adapter seam (adapters/nest-typeorm.mjs, adapters/none.mjs), and the context.txt template now comes from vault.config.json. Defaults are deliberately generic rather than this repo's names, so a project that forgets the config gets an empty vault instead of one silently pointed at transaction-analytics/. Config is resolved by walking up from cwd only: a fallback to the module's own directory silently adopted the CLI's own repo config when run elsewhere. Acceptance criterion was byte-identical _gen/*.
