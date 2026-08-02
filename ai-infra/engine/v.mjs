#!/usr/bin/env node
/** Portable, direct CLI. It reads only target-owned vault.config.json. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { findConfigUp, loadConfig } from './lib/config.mjs';

const USAGE = `vault — portable knowledge-base tooling

  build                                      generate <vault>/_gen/* (only normal writer)
  check [--strict] [--rule <id>]              validate; writes nothing
  find <query> [--json] [-n N]                ranked curated note/section references
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
    } else if (arg.startsWith('--')) flags[arg.slice(2)] = true;
    else positional.push(arg);
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
    case 'build':
      return (await import('./lib/render.mjs')).build(root, config);
    case 'check':
      return (await import('./lib/rules.mjs')).check(root, config, flags);
    case 'find':
      if (!positional.length) throw new UsageError('find requires a query');
      return (await import('./lib/search.mjs')).find(root, config, positional.join(' '), flags);
    case 'show':
      if (!positional[0]) throw new UsageError('show requires a reference');
      return (await import('./lib/search.mjs')).show(root, config, positional[0], flags);
    case 'brief':
      return (await import('./lib/search.mjs')).brief(root, config, positional, flags);
    case 'map':
      return (await import('./lib/search.mjs')).dumpMap(root, config);
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
