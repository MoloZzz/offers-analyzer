# RTK — compact bash-command output

Full reference. In `CLAUDE.md`, only the golden rule remains —
this file is read on demand, not kept in context for every request.

## RTK — compact bash-command output (MANDATORY, as far as Cowork allows)
The binary lives in `tools/rtk` (Linux ELF, works in the Cowork sandbox; it is not committed to git —
see `.gitignore`). Cowork does not support a PreToolUse hook (unlike Claude Code) —
so this is NOT automatic command interception, but a direct instruction you must follow manually
for EVERY bash command that falls under the list below.

**Rule: before running any git/grep/find/npm run/ls/tsc/lint command in this repo —
check whether there is an rtk wrapper for it below, and if there is, use that wrapper instead of the raw
command.** If `tools/rtk` is missing (fresh sandbox), restore it once:
`cp tools/rtk-cli tools/rtk && chmod +x tools/rtk`.

PATH in the sandbox does not persist between bash calls, so everywhere below `rtk <command>`
should be read as `tools/rtk <command>` (relative to the repo root).

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `tools/rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `tools/rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
tools/rtk git add . && tools/rtk git commit -m "msg" && tools/rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
tools/rtk tsc                 # TypeScript errors grouped by file/code (83%)
tools/rtk lint                # ESLint violations grouped (84%)
```

### Test (60-99% savings)
```bash
tools/rtk jest                # Jest failures only (99.5%)
tools/rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
tools/rtk git status          # Compact status
tools/rtk git log             # Compact log (works with all git flags)
tools/rtk git diff            # Compact diff (80%)
tools/rtk git show            # Compact show (80%)
tools/rtk git add             # Ultra-compact confirmations (59%)
tools/rtk git commit          # Ultra-compact confirmations (59%)
tools/rtk git push            # Ultra-compact confirmations
tools/rtk git pull            # Ultra-compact confirmations
tools/rtk git branch          # Compact branch list
tools/rtk git fetch           # Compact fetch
tools/rtk git stash           # Compact stash
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
tools/rtk npm run <script>    # Compact npm script output
tools/rtk npx <cmd>           # Compact npx command output
```

### Files & Search (60-75% savings)
```bash
tools/rtk ls <path>           # Tree format, compact (65%)
tools/rtk read <file>         # Code reading with filtering (60%)
tools/rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
tools/rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
tools/rtk err <cmd>           # Filter errors only from any command
tools/rtk log <file>          # Deduplicated logs with counts
tools/rtk json <file>         # JSON structure without values
tools/rtk env                 # Environment variables compact
tools/rtk diff                # Ultra-compact diffs
```

### Meta Commands
```bash
tools/rtk gain                # View token savings statistics
tools/rtk gain --history      # View command history with savings
```

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->
