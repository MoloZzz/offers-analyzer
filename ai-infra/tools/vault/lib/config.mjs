/**
 * Project configuration for the vault tooling.
 *
 * This module sits BELOW fs.mjs in the import order: fs.mjs sources its
 * directory constants from here, so importing fs.mjs back would be a cycle.
 * It therefore uses `node:fs` directly and imports nothing else from the vault.
 *
 * Resolution NEVER throws. hook.mjs runs in front of every Read and Write and
 * its contract is that no path can crash the session, so a missing or malformed
 * config degrades to generic defaults. Commands that WRITE call
 * `requireConfig()` instead and refuse — generating a vault into a guessed
 * directory is worse than an error message.
 */
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

export const CONFIG_FILE = 'vault.config.json';

/**
 * Generic on purpose. These must NOT mirror this repo's names: a new project
 * that forgets the config file should get an obviously-empty vault, never one
 * silently pointed at `transaction-analytics/`.
 */
const DEFAULTS = {
  vaultDir: 'vault',
  codeRoot: '.',
  adapter: 'none',
  budget: 50_000,
  stack: [],
  exampleRef: '"<Note>#<anchor>" | "<Note>#3"',
  agentScripts: ['build', 'test', 'lint'],
  /** Shown when a metric hits "relation does not exist". Null = no advice given. */
  migrateCmd: null,
};

/** Walk up from `start` looking for the config file. Returns its path or null. */
function findUp(start) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function locate() {
  const fromEnv = process.env.VAULT_CONFIG;
  if (fromEnv && existsSync(fromEnv)) return path.resolve(fromEnv);
  // cwd only, deliberately. Claude Code hooks, npm scripts and the git hook all
  // run inside the project, and the npm-package case needs nothing extra: the
  // CLI lives at <project>/node_modules/..., so walking up from any cwd inside
  // the project reaches the same config.
  //
  // Falling back to the MODULE's directory looks like it would help when the
  // CLI is invoked from elsewhere, but it silently adopts the config of
  // whatever project the CLI itself is checked out in — measured: running it
  // against an unrelated empty repo picked up this repo's `nest-typeorm`
  // adapter and then failed hunting for its database.config.ts. Use
  // VAULT_CONFIG for that case; guessing is worse than asking.
  return findUp(process.cwd());
}

function load() {
  const file = locate();
  if (!file) return { file: null, cfg: { ...DEFAULTS } };
  try {
    // Strip a UTF-8 BOM: JSON.parse rejects it, and it is what every Windows
    // editor (and PowerShell's `Out-File -Encoding utf8`) writes by default.
    // fs.mjs#norm does the same job for note text; config is read before it.
    const raw = readFileSync(file, 'utf8').replace(/^﻿/, '');
    return { file, cfg: { ...DEFAULTS, ...JSON.parse(raw) } };
  } catch (err) {
    // Kept, not thrown: see the module contract above. requireConfig re-raises
    // it for the commands that cannot proceed on a guess.
    return { file, cfg: { ...DEFAULTS }, error: `${CONFIG_FILE} is not valid JSON: ${err.message}` };
  }
}

const loaded = load();

export const CONFIG = loaded.cfg;
export const CONFIG_PATH = loaded.file;
/** Directory holding the config file — the repo root every relative path resolves against. */
export const CONFIG_ROOT = loaded.file ? path.dirname(loaded.file) : null;

/**
 * Assert a real config was found. Called by commands that write, or whose
 * output against defaults would be confidently wrong rather than empty.
 */
export function requireConfig() {
  if (loaded.error) throw new Error(loaded.error);
  if (!CONFIG_PATH) {
    throw new Error(
      `no ${CONFIG_FILE} found (searched up from ${process.cwd()}). Create one at the repo root, e.g.\n` +
        `  {"vaultDir": "vault", "codeRoot": "backend", "adapter": "none"}`,
    );
  }
  return CONFIG;
}
