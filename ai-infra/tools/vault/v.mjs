#!/usr/bin/env node
/**
 * vault — second-brain tooling for transaction-analytics/
 *
 * HARD CONTRACT:
 *   build  writes (_gen/*, auto-blocks, rev: pins)   — NEVER called from a hook
 *   check  writes NOTHING, ever                      — the only hook-safe command
 * This split is what makes the regeneration loop structurally impossible.
 *
 * Exit codes:
 *   0  clean
 *   1  error-severity findings   (your vault has a problem)
 *   2  tool/usage error          (the tool has a problem)
 * Keeping 1 and 2 distinct means a crashed parser never reads as "vault is bad".
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

const USAGE = `vault — knowledge base tooling

  build [--seed-frontmatter|--seed-facts|--seed-rev]   regenerate _gen/* and auto-blocks
  check [--staged] [--strict] [--rule <id>]            validate; writes nothing
  pin <note>                                           re-pin rev: (requires a staged edit)
  find <query> [--json] [-n N]                         ranked path#N :: heading
  show <ref> [--links] [--ctx] [--max-lines N]         print one section
  brief <ref>...                                       context.txt + named sections
  map                                                  dump map.tsv
  log [--misses] [-n N] [--clear]                      retrieval misses / truncations
  ctx [<session>] [--all] [--list] [--history] [--json]  where this session's tokens went
      [--strict] [--transcript <path>]
  decide "<line>" --section <substring>                append a row to Decision Log
  evidence [--dry] [--json]                            measure _metrics.tsv against the live DB
  init-hooks                                           arm core.hooksPath (never fails)
  hook session-start|subagent-start|post-read          Claude Code hook adapter

Refs accept: "Data Model#crypto_purchases" | "Data Model#5" | "matching#2"
`;

/**
 * Resolve the repo root via git and chdir into it, so every command behaves
 * identically no matter which subdirectory it was invoked from (git hooks run
 * from varying cwds depending on the client).
 */
function repoRoot() {
  // Hooks now run in front of every Read and Write, and `git rev-parse` is a
  // subprocess: measured, it was ~60ms of a ~140ms hook. Claude Code already
  // exports the project directory, so take that hint when it is demonstrably a
  // repo root AND contains the cwd — the containment check is what makes this
  // safe to apply to every command rather than only to hooks.
  const hinted = process.env.CLAUDE_PROJECT_DIR;
  if (hinted) {
    const abs = path.resolve(hinted);
    const rel = path.relative(abs, process.cwd());
    if (!rel.startsWith('..') && !path.isAbsolute(rel) && existsSync(path.join(abs, '.git'))) return abs;
  }
  const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return path.resolve(out.toString('utf8').trim());
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      a === '-n' ||
      a === '--max-lines' ||
      a === '--rule' ||
      a === '--section' ||
      a === '--session' ||
      a === '--transcript'
    )
      flags[a.replace(/^-+/, '')] = argv[++i];
    else if (a.startsWith('--')) flags[a.slice(2)] = true;
    else positional.push(a);
  }
  return { flags, positional };
}

/**
 * Arm the git hook. Wired to npm `prepare` in backend/package.json so a fresh
 * clone gets enforcement from `npm install` instead of a documented manual step
 * everyone forgets.
 *
 * MUST NOT THROW under any circumstance: a failing `prepare` script aborts the
 * whole `npm install`, and this also runs in CI and in tarball installs where
 * there may be no git repo at all. Failing to arm a hook is not worth breaking
 * a developer's install over.
 */
function initHooks() {
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
      cwd: repoRoot(),
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    process.stdout.write('vault: core.hooksPath -> .githooks\n');
  } catch {
    process.stdout.write('vault: skipped hook setup (no git repo or git unavailable)\n');
  }
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stderr.write(USAGE);
    return 2;
  }
  if (cmd === 'init-hooks') return initHooks();

  const root = repoRoot();
  process.chdir(root);
  const { flags, positional } = parseArgs(rest);

  switch (cmd) {
    case 'build': {
      // The only command that writes the generated tree. Everything else
      // degrades quietly on a missing config; generating a vault into a guessed
      // directory would not be a degradation, it would be wrong output.
      const { requireConfig } = await import('./lib/config.mjs');
      requireConfig();
      const { build } = await import('./lib/render.mjs');
      return build(root, flags);
    }
    case 'check': {
      const { check } = await import('./lib/rules.mjs');
      return check(root, flags);
    }
    case 'pin': {
      const { pin } = await import('./lib/render.mjs');
      if (!positional[0]) throw new UsageError('pin requires a note path');
      return pin(root, positional[0]);
    }
    case 'find': {
      const { find } = await import('./lib/search.mjs');
      if (!positional.length) throw new UsageError('find requires a query');
      return find(root, positional.join(' '), flags);
    }
    case 'show': {
      const { show } = await import('./lib/search.mjs');
      if (!positional[0]) throw new UsageError('show requires a ref');
      return show(root, positional[0], flags);
    }
    case 'brief': {
      const { brief } = await import('./lib/search.mjs');
      return brief(root, positional, flags);
    }
    case 'map': {
      const { dumpMap } = await import('./lib/search.mjs');
      return dumpMap(root);
    }
    case 'log': {
      const { report } = await import('./lib/log.mjs');
      return report(root, flags);
    }
    case 'ctx': {
      // --history reads the rows the SessionEnd hook wrote, so it lives with
      // the writer in guard.mjs; everything else profiles a transcript.
      if (flags.history) {
        const { historyReport } = await import('./lib/guard.mjs');
        return historyReport(root, flags);
      }
      const { ctx } = await import('./lib/ctx.mjs');
      return ctx(root, flags, positional);
    }
    case 'hook': {
      const { hook } = await import('./lib/hook.mjs');
      return hook(root, positional[0]);
    }
    case 'decide': {
      const { decide } = await import('./lib/render.mjs');
      if (!positional.length) throw new UsageError('decide requires the decision text');
      return decide(root, positional.join(' '), flags);
    }
    case 'evidence': {
      // Reads live data, so it is NOT part of `check` and never runs in a hook.
      const { evidence } = await import('./lib/evidence.mjs');
      return evidence(root, flags);
    }
    default:
      process.stderr.write(`vault: unknown command '${cmd}'\n\n${USAGE}`);
      return 2;
  }
}

export class UsageError extends Error {}

main()
  .then((code) => {
    process.exitCode = typeof code === 'number' ? code : 0;
  })
  .catch((err) => {
    // Hook-facing messages stay ASCII English: a mangled instruction is
    // unrecoverable under cmd.exe's OEM codepage, mangled quoted text is not.
    process.stderr.write(`vault: ${err instanceof UsageError ? err.message : err.stack || err.message}\n`);
    process.exitCode = 2;
  });
