/**
 * Configuration for the project-neutral vault engine.
 *
 * The engine deliberately knows no project folder names.  A repository opts in
 * by placing `vault.config.json` at its root (or setting VAULT_CONFIG).  The
 * CLI loads this configuration once and passes it explicitly to the rest of
 * the engine, which also makes the core easy to test against small fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export const CONFIG_FILE = 'vault.config.json';

export const DEFAULT_CONFIG = Object.freeze({
  vaultDir: 'vault',
  codeRoot: '.',
  adapter: 'none',
  indexNote: '00-INDEX',
  roadmapNote: 'Roadmap & Status',
  contextDir: 'context',
  specsDir: 'specs',
  currentContext: null,
  budget: null,
  stack: [],
  agentScripts: ['build', 'test', 'lint'],
  exampleRef: '"<Note>#<section>" | "<Note>#2"',
});

function findUp(start, filename = CONFIG_FILE) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, filename);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function safeRelative(value, key) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty relative path`);
  }
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`${key} must stay inside the repository`);
  }
  return normalized;
}

function nonEmptyString(value, key) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${key} must be a non-empty string`);
  return value.trim();
}

/** Validate and normalize a parsed config. Exported for focused fixture tests. */
export function normalizeConfig(raw, root = process.cwd()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${CONFIG_FILE} must contain a JSON object`);
  }

  const cfg = { ...DEFAULT_CONFIG, ...raw };
  cfg.vaultDir = safeRelative(cfg.vaultDir, 'vaultDir');
  cfg.codeRoot = safeRelative(cfg.codeRoot, 'codeRoot');
  cfg.contextDir = safeRelative(cfg.contextDir, 'contextDir');
  cfg.specsDir = safeRelative(cfg.specsDir, 'specsDir');
  if (cfg.currentContext !== null) {
    cfg.currentContext = safeRelative(cfg.currentContext, 'currentContext');
    if (
      cfg.currentContext !== cfg.contextDir &&
      !cfg.currentContext.startsWith(`${cfg.contextDir}/`)
    ) {
      throw new Error('currentContext must be inside contextDir');
    }
  }
  cfg.adapter = nonEmptyString(cfg.adapter, 'adapter');
  cfg.indexNote = nonEmptyString(cfg.indexNote, 'indexNote');
  cfg.roadmapNote = nonEmptyString(cfg.roadmapNote, 'roadmapNote');
  cfg.exampleRef = nonEmptyString(cfg.exampleRef, 'exampleRef');

  if (cfg.budget !== null && (!Number.isInteger(cfg.budget) || cfg.budget <= 0)) {
    throw new Error('budget must be a positive integer or null');
  }
  if (!Array.isArray(cfg.stack) || !cfg.stack.every((item) => typeof item === 'string')) {
    throw new Error('stack must be an array of strings');
  }
  if (
    !Array.isArray(cfg.agentScripts) ||
    !cfg.agentScripts.every((item) => typeof item === 'string')
  ) {
    throw new Error('agentScripts must be an array of strings');
  }

  return Object.freeze({ ...cfg, root: path.resolve(root) });
}

/** Find and load configuration without silently borrowing a neighbouring project. */
export function loadConfig({ cwd = process.cwd(), required = true } = {}) {
  const fromEnv = process.env.VAULT_CONFIG;
  const file = fromEnv ? path.resolve(fromEnv) : findUp(cwd);
  if (!file || !existsSync(file)) {
    if (!required) return null;
    throw new Error(
      `no ${CONFIG_FILE} found (searched up from ${path.resolve(cwd)}). ` +
        `Create one with at least {"vaultDir":"vault","adapter":"none"}.`,
    );
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${file}: invalid JSON: ${error.message}`);
  }
  return Object.freeze({ ...normalizeConfig(raw, path.dirname(file)), file: path.resolve(file) });
}

export function findConfigUp(start = process.cwd()) {
  return findUp(start);
}
