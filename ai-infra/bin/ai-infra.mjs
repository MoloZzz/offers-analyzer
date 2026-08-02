#!/usr/bin/env node
/**
 * Safe bootstrap CLI for the portable AI infrastructure kit.
 *
 * The default init mode is a dry run.  An install is deliberately copy-and-own:
 * this command never edits an existing file, enables integrations, or contacts
 * external services.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(import.meta.url);
const KIT_ROOT = path.resolve(path.dirname(FILE), '..');
const DEFAULT_STACK_LINE = 'Node.js 20 + built-in AI infrastructure';
const DEFAULT_QUALITY_COMMANDS =
  'node ai-infra/engine/v.mjs build\nnode ai-infra/engine/v.mjs check --strict';

const USAGE = [
  'ai-infra - portable knowledge-system bootstrap',
  '',
  '  init --target <directory> --project-name <name> [--dry-run | --apply]',
  '       [--vault-dir <relative-directory>]',
  '  doctor --target <directory>',
  '',
  'init defaults to --dry-run. --apply is required before any file is created.',
  'The initializer refuses collisions and never enables CI, hooks, agents, or plugins.',
  '',
].join('\n');

export class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

function write(writer, message) {
  writer(String(message).endsWith('\n') ? String(message) : String(message) + '\n');
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new CliError(flag + ' requires a value');
  return value;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    return { command: 'help', options: {} };
  }

  if (command !== 'init' && command !== 'doctor') {
    throw new CliError("unknown command '" + command + "'");
  }

  const options = {
    target: null,
    projectName: null,
    vaultDir: null,
    apply: false,
    dryRun: false,
  };

  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    switch (value) {
      case '--target':
        options.target = requireValue(rest, index, value);
        index++;
        break;
      case '--project-name':
        options.projectName = requireValue(rest, index, value);
        index++;
        break;
      case '--vault-dir':
        options.vaultDir = requireValue(rest, index, value);
        index++;
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new CliError("unknown option '" + value + "'");
    }
  }

  if (!options.target) throw new CliError(command + ' requires --target <directory>');
  if (command === 'init') {
    if (!options.projectName) throw new CliError('init requires --project-name <name>');
    if (options.apply && options.dryRun) {
      throw new CliError('choose either --dry-run or --apply, not both');
    }
  } else if (
    options.projectName !== null ||
    options.vaultDir !== null ||
    options.apply ||
    options.dryRun
  ) {
    throw new CliError('doctor accepts only --target <directory>');
  }

  return { command, options };
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CliError(label + ' must be a non-empty relative path');
  }
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..') ||
    normalized === '.'
  ) {
    throw new CliError(label + ' must stay inside the target directory');
  }
  return normalized;
}

function projectName(value) {
  const normalized = String(value || '').trim();
  if (!normalized || /[\r\n]/.test(normalized) || normalized.length > 160) {
    throw new CliError('--project-name must be one line and at most 160 characters');
  }
  return normalized;
}

export function projectSlug(value) {
  const normalized = projectName(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'project';
}

function dateStamp(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function isSameOrNested(candidate, container) {
  const relative = path.relative(container, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function assertTargetDoesNotOverlapKit(target, kitRoot) {
  if (isSameOrNested(target, kitRoot) || isSameOrNested(kitRoot, target)) {
    throw new CliError(
      '--target may not be the kit directory, its parent, or a directory inside it',
      1,
    );
  }
}

function sourceFiles(sourceRoot) {
  if (!existsSync(sourceRoot)) {
    throw new CliError('kit is incomplete: missing ' + sourceRoot, 1);
  }

  const files = [];
  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new CliError('kit source may not contain symlinks: ' + absolute, 1);
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      } else {
        throw new CliError('kit source contains an unsupported entry: ' + absolute, 1);
      }
    }
  }
  visit(sourceRoot);
  return files;
}

function withoutTemplateSuffix(value) {
  return value.endsWith('.template') ? value.slice(0, -'.template'.length) : value;
}

function targetPath(target, relative) {
  const resolved = path.resolve(target, relative);
  if (!isSameOrNested(resolved, target) || resolved === target) {
    throw new CliError('internal target path escapes the selected directory', 1);
  }
  return resolved;
}

function templateValues(options, now) {
  const name = projectName(options.projectName);
  const slug = projectSlug(name);
  const vaultDir = safeRelative(options.vaultDir || 'knowledge-' + slug, '--vault-dir');
  return {
    projectName: name,
    projectSlug: slug,
    vaultDir,
    replacements: new Map([
      ['{{PROJECT_NAME}}', name],
      ['{{PROJECT_SLUG}}', slug],
      ['{{VAULT_DIR}}', vaultDir],
      ['{{DATE}}', dateStamp(now)],
      ['{{STACK_LINE}}', DEFAULT_STACK_LINE],
      ['{{QUALITY_COMMANDS}}', DEFAULT_QUALITY_COMMANDS],
    ]),
  };
}

function replaceTokens(source, replacements, sourcePath) {
  let result = source;
  for (const [token, value] of replacements) result = result.split(token).join(value);
  const unresolved = result.match(/\{\{[A-Z][A-Z0-9_]*\}\}/g);
  if (unresolved?.length) {
    throw new CliError(
      'template has unresolved placeholder(s) ' +
        Array.from(new Set(unresolved)).join(', ') +
        ': ' +
        sourcePath,
      1,
    );
  }
  return result;
}

function planTree(plan, sourceRoot, destinationRoot, target, replacements = null) {
  for (const source of sourceFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, source).replace(/\\/g, '/');
    const destination = targetPath(
      target,
      path.posix.join(destinationRoot, withoutTemplateSuffix(relative)),
    );
    const content = replacements
      ? Buffer.from(replaceTokens(readFileSync(source, 'utf8'), replacements, source), 'utf8')
      : readFileSync(source);
    plan.push({ source, destination, content });
  }
}

function planFile(plan, source, destinationRelative, target, replacements = null) {
  if (!existsSync(source)) return;
  const stat = lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new CliError('kit source must be a regular file: ' + source, 1);
  }
  const content = replacements
    ? Buffer.from(replaceTokens(readFileSync(source, 'utf8'), replacements, source), 'utf8')
    : readFileSync(source);
  plan.push({ source, destination: targetPath(target, destinationRelative), content });
}

export function createInstallPlan({ target, options, kitRoot = KIT_ROOT, now = new Date() }) {
  assertTargetDoesNotOverlapKit(target, kitRoot);
  const values = templateValues(options, now);
  const plan = [];

  planTree(plan, path.join(kitRoot, 'bin'), 'ai-infra/bin', target);
  planTree(plan, path.join(kitRoot, 'engine'), 'ai-infra/engine', target);
  planTree(
    plan,
    path.join(kitRoot, 'templates', 'vault'),
    values.vaultDir,
    target,
    values.replacements,
  );
  planTree(plan, path.join(kitRoot, 'templates', 'specs'), 'specs', target, values.replacements);
  planFile(
    plan,
    path.join(kitRoot, 'templates', 'vault.config.json.template'),
    'vault.config.json',
    target,
    values.replacements,
  );

  for (const metadata of ['VERSION', 'manifest.json']) {
    const source = path.join(kitRoot, metadata);
    if (!existsSync(source)) {
      throw new CliError('kit is incomplete: missing ' + source, 1);
    }
    planFile(plan, source, 'ai-infra/' + metadata, target);
  }

  const destinations = new Set();
  for (const item of plan) {
    const key = path.normalize(item.destination).toLowerCase();
    if (destinations.has(key)) {
      throw new CliError('kit maps multiple files to one destination: ' + item.destination, 1);
    }
    destinations.add(key);
  }

  return { plan, values };
}

function parentConflicts(target, destination) {
  const conflicts = [];
  let current = path.dirname(destination);
  while (isSameOrNested(current, target)) {
    if (existsSync(current) && !statSync(current).isDirectory()) conflicts.push(current);
    if (current === target) break;
    current = path.dirname(current);
  }
  return conflicts;
}

export function collisionsForPlan(target, plan) {
  const collisions = [];
  if (existsSync(target) && !statSync(target).isDirectory()) collisions.push(target);
  for (const item of plan) {
    if (existsSync(item.destination)) collisions.push(item.destination);
    collisions.push(...parentConflicts(target, item.destination));
  }
  return Array.from(new Set(collisions)).sort((a, b) => a.localeCompare(b));
}

function relativeList(target, values) {
  return values.map((value) => path.relative(target, value).replace(/\\/g, '/'));
}

export function initialize({
  target,
  options,
  kitRoot = KIT_ROOT,
  now = new Date(),
  stdout = process.stdout.write.bind(process.stdout),
}) {
  const { plan, values } = createInstallPlan({ target, options, kitRoot, now });
  const collisions = collisionsForPlan(target, plan);
  if (collisions.length) {
    throw new CliError(
      'refusing to overwrite ' +
        collisions.length +
        ' existing path(s):\n' +
        relativeList(target, collisions)
          .map((item) => '  - ' + item)
          .join('\n'),
      1,
    );
  }

  const mode = options.apply ? 'apply' : 'dry-run';
  write(stdout, 'init: ' + mode + ' for ' + target);
  write(stdout, 'project: ' + values.projectName + '  vault: ' + values.vaultDir);
  write(stdout, (options.apply ? 'creating' : 'would create') + ' ' + plan.length + ' file(s):');
  for (const item of plan) {
    write(stdout, '  - ' + path.relative(target, item.destination).replace(/\\/g, '/'));
  }

  if (!options.apply) {
    write(
      stdout,
      'dry run complete; no files were written. Re-run with --apply to create this kit.',
    );
    return 0;
  }

  for (const item of plan) {
    mkdirSync(path.dirname(item.destination), { recursive: true });
    writeFileSync(item.destination, item.content, { flag: 'wx' });
  }
  write(stdout, 'init complete. Next: node ai-infra/engine/v.mjs build');
  return 0;
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new CliError(label + ': invalid JSON (' + error.message + ')', 1);
  }
}

function doctorTarget(target, stdout) {
  const errors = [];
  const warnings = [];
  const configPath = path.join(target, 'vault.config.json');
  let config = null;

  if (!existsSync(target) || !statSync(target).isDirectory()) {
    errors.push('target directory does not exist');
  }
  if (!errors.length && !existsSync(configPath)) {
    errors.push('missing vault.config.json');
  }
  if (!errors.length) {
    try {
      config = readJson(configPath, 'vault.config.json');
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        errors.push('vault.config.json must contain an object');
        config = null;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  const engine = path.join(target, 'ai-infra', 'engine', 'v.mjs');
  if (!existsSync(engine)) errors.push('missing ai-infra/engine/v.mjs');

  if (config) {
    let vaultDir = null;
    try {
      vaultDir = safeRelative(config.vaultDir, 'vault.config.json vaultDir');
    } catch (error) {
      errors.push(error.message);
    }
    if (vaultDir) {
      const vault = path.join(target, vaultDir);
      if (!existsSync(vault) || !statSync(vault).isDirectory()) {
        errors.push('configured vault directory is missing: ' + vaultDir);
      }
      const index = typeof config.indexNote === 'string' ? config.indexNote : null;
      if (index && !existsSync(path.join(vault, index + '.md'))) {
        warnings.push("configured index note was not found as '" + vaultDir + '/' + index + ".md'");
      }
      if (!existsSync(path.join(vault, '_gen', 'context.txt'))) {
        warnings.push('generated context is absent; run node ai-infra/engine/v.mjs build');
      }
      if (config.adapter !== 'none') {
        warnings.push(
          "adapter '" + String(config.adapter) + "' is project-owned; verify it separately",
        );
      }
    }
  }

  const versionFile = path.join(target, 'ai-infra', 'VERSION');
  if (existsSync(versionFile)) {
    write(stdout, 'doctor: kit version ' + readFileSync(versionFile, 'utf8').trim());
  } else {
    warnings.push('installed kit has no VERSION marker');
  }
  if (errors.length) {
    write(stdout, 'doctor: failed');
    for (const error of errors) write(stdout, 'ERROR ' + error);
  } else {
    write(stdout, 'doctor: core installation is present');
  }
  for (const warning of warnings) write(stdout, 'WARN ' + warning);
  return errors.length ? 1 : 0;
}

export async function runCli(
  argv,
  {
    kitRoot = KIT_ROOT,
    cwd = process.cwd(),
    now = new Date(),
    stdout = process.stdout.write.bind(process.stdout),
    stderr = process.stderr.write.bind(process.stderr),
  } = {},
) {
  try {
    const { command, options } = parseArgs(argv);
    if (command === 'help') {
      write(stdout, USAGE);
      return 0;
    }
    const target = path.resolve(cwd, options.target);
    if (command === 'init') return initialize({ target, options, kitRoot, now, stdout });
    return doctorTarget(target, stdout);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    const message =
      error instanceof CliError ? error.message : error.stack || error.message || String(error);
    write(stderr, 'ai-infra: ' + message);
    return exitCode;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(FILE)) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
