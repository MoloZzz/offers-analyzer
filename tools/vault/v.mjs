#!/usr/bin/env node
/**
 * vault — project-neutral second-brain tooling.
 *
 * Contract: `build` is the only command that writes curated derived artifacts
 * (only to <vault>/_gen). The explicitly invoked `evidence` command is the
 * sole separate exception: it may write its ignored local observation cache.
 * `check`, `find`, `show`, `brief`, and `map` are read-only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { findConfigUp, loadConfig } from './lib/config.mjs';

const USAGE = `vault — knowledge-base tooling

  build                                      generate <vault>/_gen/* (only writer)
  check [--strict] [--rule <id>]              validate; writes nothing
  evidence [--dry] [--json]                   validate or measure advisory read-only metrics
  find <query> [--json] [-n N]                ranked curated note/section refs
  show <ref> [--links] [--ctx] [--max-lines N]
                                             print one curated note section
  brief <ref>...                              generated L1 context + named sections
  map                                        print generated curated note map

Refs accept: "Note#heading" | "Note#2" | "folder/note#2"
`;

class UsageError extends Error {}

function rootFromConfigOrGit() {
  const config = findConfigUp(process.cwd());
  if (config) return path.dirname(config);

  const hinted = process.env.VAULT_ROOT;
  if (hinted && existsSync(path.join(path.resolve(hinted), 'vault.config.json')))
    return path.resolve(hinted);

  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const values = new Set(['-n', '--max-lines', '--rule']);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (values.has(arg)) {
      const value = argv[++index];
      if (value === undefined) throw new UsageError(`${arg} requires a value`);
      flags[arg.replace(/^-+/, '')] = value;
    } else if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    process.stderr.write(USAGE);
    return command ? 0 : 2;
  }

  const root = rootFromConfigOrGit();
  process.chdir(root);
  const config = loadConfig({ cwd: root });
  const { flags, positional } = parseArgs(rest);

  switch (command) {
    case 'build': {
      const { build } = await import('./lib/render.mjs');
      return build(root, config);
    }
    case 'check': {
      const { check } = await import('./lib/rules.mjs');
      return check(root, config, flags);
    }
    case 'evidence': {
      const { evidence } = await import('./lib/evidence.mjs');
      return evidence(root, config, flags);
    }
    case 'find': {
      if (!positional.length) throw new UsageError('find requires a query');
      const { find } = await import('./lib/search.mjs');
      return find(root, config, positional.join(' '), flags);
    }
    case 'show': {
      if (!positional[0]) throw new UsageError('show requires a reference');
      const { show } = await import('./lib/search.mjs');
      return show(root, config, positional[0], flags);
    }
    case 'brief': {
      const { brief } = await import('./lib/search.mjs');
      return brief(root, config, positional, flags);
    }
    case 'map': {
      const { dumpMap } = await import('./lib/search.mjs');
      return dumpMap(root, config);
    }
    default:
      throw new UsageError(`unknown command '${command}'`);
  }
}

main()
  .then((code) => {
    process.exitCode = typeof code === 'number' ? code : 0;
  })
  .catch((error) => {
    process.stderr.write(
      `vault: ${error instanceof UsageError ? error.message : error.stack || error.message}\n`,
    );
    process.stderr.write(USAGE);
    process.exitCode = 2;
  });
