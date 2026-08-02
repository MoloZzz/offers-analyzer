/**
 * Target-owned configuration for the portable vault engine.
 *
 * The engine has no knowledge of a particular product, framework, package
 * manager, or source tree. A repository opts in by placing this file at its
 * root (or pointing VAULT_CONFIG at it).
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export const CONFIG_FILE = 'vault.config.json';

export const DEFAULT_CONFIG = Object.freeze({
  vaultDir: 'knowledge',
  codeRoot: '.',
  adapter: 'none',
  indexNote: '00-INDEX',
  roadmapNote: 'Roadmap & Status',
  contextDir: 'context',
  currentContext: null,
  stack: [],
  qualityCommands: [],
  synonymsFile: null,
  locale: 'en',
  engineCommand: 'node ai-infra/engine/v.mjs',
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
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeCommands(value) {
  if (!Array.isArray(value)) throw new Error('qualityCommands must be an array');
  return Object.freeze(
    value.map((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        return Object.freeze({ label: item.trim(), command: item.trim() });
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`qualityCommands[${index}] must be a command string or object`);
      }
      const command = nonEmptyString(item.command, `qualityCommands[${index}].command`);
      const label =
        item.label === undefined
          ? command
          : nonEmptyString(item.label, `qualityCommands[${index}].label`);
      return Object.freeze({ label, command });
    }),
  );
}

/** Validate and normalize parsed config. Exported for fixture tests. */
export function normalizeConfig(raw, root = process.cwd()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${CONFIG_FILE} must contain a JSON object`);
  }

  const cfg = { ...DEFAULT_CONFIG, ...raw };
  cfg.vaultDir = safeRelative(cfg.vaultDir, 'vaultDir');
  cfg.codeRoot = safeRelative(cfg.codeRoot, 'codeRoot');
  cfg.contextDir = safeRelative(cfg.contextDir, 'contextDir');
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
  if (
    cfg.adapter !== 'none' &&
    (path.isAbsolute(cfg.adapter) || cfg.adapter.replace(/\\/g, '/').split('/').includes('..'))
  ) {
    throw new Error('adapter must be "none" or a repository-relative module path');
  }
  cfg.indexNote = nonEmptyString(cfg.indexNote, 'indexNote');
  cfg.roadmapNote = nonEmptyString(cfg.roadmapNote, 'roadmapNote');
  cfg.engineCommand = nonEmptyString(cfg.engineCommand, 'engineCommand');
  cfg.exampleRef = nonEmptyString(cfg.exampleRef, 'exampleRef');
  cfg.locale = nonEmptyString(cfg.locale, 'locale');
  try {
    ''.toLocaleLowerCase(cfg.locale);
  } catch {
    throw new Error(`locale '${cfg.locale}' is not supported by this Node runtime`);
  }
  cfg.synonymsFile =
    cfg.synonymsFile === null ? null : safeRelative(cfg.synonymsFile, 'synonymsFile');
  if (!Array.isArray(cfg.stack) || !cfg.stack.every((item) => typeof item === 'string')) {
    throw new Error('stack must be an array of strings');
  }
  cfg.qualityCommands = normalizeCommands(cfg.qualityCommands);

  return Object.freeze({ ...cfg, root: path.resolve(root) });
}

/** Find and load configuration without borrowing a neighbouring target by accident. */
export function loadConfig({ cwd = process.cwd(), required = true } = {}) {
  const fromEnv = process.env.VAULT_CONFIG;
  const file = fromEnv ? path.resolve(fromEnv) : findUp(cwd);
  if (!file || !existsSync(file)) {
    if (!required) return null;
    throw new Error(
      `no ${CONFIG_FILE} found (searched up from ${path.resolve(cwd)}). ` +
        `Create one with at least {"vaultDir":"knowledge","adapter":"none"}.`,
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
