<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) — Token-Optimized Commands

RTK is a CLI proxy that filters/summarizes noisy command output before it reaches
the model context (60–90% token savings on common dev operations). In this repo the
PreToolUse hook (`.claude/settings.json`) auto-rewrites Bash commands to `rtk ...`,
so you normally don't type `rtk` yourself — but the rules below are the source of
truth when running commands manually or in `&&` chains.

## Golden Rule

**Always prefix commands with `rtk`.** If RTK has a dedicated filter it uses it;
otherwise it passes through unchanged, so `rtk` is always safe.

Even inside `&&` chains, prefix every command:

```bash
# WRONG
git add . && git commit -m "msg" && git push
# CORRECT
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## Commands by workflow

### Build & compile (70–90%)
```bash
rtk tsc          # TS errors grouped by file/code (83%)
rtk lint         # ESLint/Biome violations grouped (84%)
rtk next build   # Next.js build with route metrics (87%)
rtk cargo build / rtk cargo check / rtk cargo clippy
rtk prettier --check
```

### Test (60–99%)
```bash
rtk jest         # Jest failures only (99.5%)
rtk vitest       # Vitest failures only (99.5%)
rtk pytest / rtk go test / rtk cargo test / rtk playwright test
rtk test <cmd>   # generic test wrapper — failures only
```

### Git (59–80%) — passthrough works for ALL subcommands
```bash
rtk git status / log / diff / show / add / commit / push / pull / branch / fetch / stash
```

### GitHub / GitLab (26–87%)
```bash
rtk gh pr view <n> / rtk gh pr checks / rtk gh run list / rtk gh issue list / rtk gh api
rtk glab ...
```

### JS/TS tooling (70–90%)
```bash
rtk pnpm install / list / outdated
rtk npm run <script>   rtk npx <cmd>   rtk uv run <cmd>
rtk prisma ...         # no ASCII art (88%)
```

### Files & search (60–75%)
```bash
rtk ls <path>          rtk tree
rtk read <file>        # code reading with filtering (60%)
rtk grep <pattern>     # grouped by file (75%). Format flags (-c,-l,-L,-o,-Z) run raw.
rtk find <pattern>     # grouped by directory (70%)
```

### Analysis & debug
```bash
rtk err <cmd>    # only errors/warnings
rtk log <file>   # deduplicated logs with counts
rtk json <file>  # structure without values
rtk summary <cmd>   rtk deps   rtk env
```

### Infrastructure / network
```bash
rtk docker ps / images / logs      rtk kubectl get / logs
rtk curl <url>   rtk wget <url>
```

### Meta (use rtk directly)
```bash
rtk gain             # token-savings analytics
rtk gain --history   # command history with savings
rtk discover         # analyze sessions for missed rtk opportunities
rtk proxy <cmd>      # run raw command, no filtering (debugging)
```

## When NOT to bother
A single trivial `cat` of a short file, or any command with naturally short output —
the wrapper buys nothing. The point is compacting noisy output (tests, lint, git
diffs, tsc), not wrapping every call reflexively.

## Project-local filters
Custom filters live in `.rtk/filters.toml` (committed with the repo) and override
built-ins. See the template comments in that file.
<!-- /rtk-instructions -->
