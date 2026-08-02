/**
 * Offers Analyzer source-fact adapter.
 *
 * The generic vault engine intentionally knows nothing about this repository's
 * NestJS layout. This adapter reads only explicit, local source-of-truth files
 * and fails when one cannot be parsed rather than manufacturing a code fact.
 */
import * as path from 'node:path';

import { readText, sortBy, walk } from '../lib/fs.mjs';

const DATA_SOURCE = 'src/common/database/data-source.ts';
const MIGRATIONS_DIR = 'src/common/database/migrations';
const CONFIGURATION = 'src/common/config/configuration.ts';
const ENV_EXAMPLE = '.env.example';

const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
const ENTITY_ARRAY_RE = /export\s+const\s+ENTITIES\s*=\s*\[([\s\S]*?)\];/;
const ENTITY_TABLE_RE = /@Entity\(\s*['"]([^'"]+)['"]/;
const COLUMN_DECORATOR_RE =
  /@(Column|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\b\s*\(/g;
const CLASS_RE = /export\s+class\s+(\w+)\s+implements\s+([^\{]+)/g;
const KEY_RE = /readonly\s+key\s*=\s*['"]([^'"]+)['"]/;
const ENV_USE_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const ENV_LINE_RE = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/;
const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(abstract class|class|async function|function|const|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const MIGRATION_CLASS_RE = /export\s+class\s+(\w+)/;
const CREATE_TABLE_RE = /\bCREATE\s+TABLE\s+"?([A-Za-z_][\w$]*)"?/gi;
const TABLE_OBJECT_RE = /new\s+Table\s*\(\s*\{[\s\S]{0,500}?\bname\s*:\s*['"]([^'"]+)['"]/g;

function fromRoot(root, relative) {
  return path.resolve(root, relative);
}

function sourceImportMap(source) {
  const imports = new Map();
  for (const match of source.matchAll(IMPORT_RE)) {
    for (const rawName of match[1].split(',')) {
      const normalized = rawName.trim();
      if (!normalized) continue;
      const alias = normalized.match(/^(\w+)\s+as\s+(\w+)$/);
      imports.set(alias ? alias[2] : normalized, match[2]);
    }
  }
  return imports;
}

function relativeImportFile(baseFile, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error(`entity import '${specifier}' is not a relative TypeScript file`);
  }
  const base = path.posix.dirname(baseFile);
  const joined = path.posix.normalize(path.posix.join(base, specifier));
  // Nest entities commonly use names such as `listing.entity`.  `extname()`
  // treats `.entity` as an extension even though TypeScript module resolution
  // still needs the final `.ts`, so recognise only real source extensions.
  return /\.[cm]?[jt]sx?$/i.test(joined) ? joined : `${joined}.ts`;
}

function extractParenArgs(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index++) {
    if (text[index] === '(') depth++;
    if (text[index] === ')') {
      depth--;
      if (depth === 0) return { args: text.slice(openIndex + 1, index), end: index + 1 };
    }
  }
  throw new Error('unbalanced TypeORM decorator parentheses');
}

function decoratorType(args) {
  const direct = args.trim().match(/^['"]([^'"]+)['"]/);
  if (direct) return direct[1];
  const typed = args.match(/\btype\s*:\s*['"]([^'"]+)['"]/);
  return typed ? typed[1] : null;
}

function extractColumns(source) {
  const columns = [];
  const matcher = new RegExp(COLUMN_DECORATOR_RE.source, 'g');
  let match;
  while ((match = matcher.exec(source))) {
    const open = match.index + match[0].length - 1;
    const { args, end } = extractParenArgs(source, open);
    const property = source.slice(end).match(/^\s*([A-Za-z_$][\w$]*)\s*[!?]?\s*:/);
    if (property) columns.push({ name: property[1], type: decoratorType(args) });
    matcher.lastIndex = end;
  }
  return columns;
}

/** TypeORM entity registry, read from the application's declared `ENTITIES` array. */
export function entities(root) {
  const source = readText(fromRoot(root, DATA_SOURCE));
  const match = source.match(ENTITY_ARRAY_RE);
  if (!match) throw new Error(`${DATA_SOURCE}: exported ENTITIES array not found`);

  const imports = sourceImportMap(source);
  const classNames = match[1]
    .replace(/\/\/.*$/gm, '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (!classNames.length) throw new Error(`${DATA_SOURCE}: ENTITIES array is empty`);

  return classNames.map((className) => {
    const specifier = imports.get(className);
    if (!specifier) throw new Error(`${DATA_SOURCE}: entity '${className}' has no matching import`);
    const file = relativeImportFile(DATA_SOURCE, specifier);
    const entitySource = readText(fromRoot(root, file));
    const table = entitySource.match(ENTITY_TABLE_RE)?.[1];
    if (!table) throw new Error(`${file}: @Entity('table') decorator not found for '${className}'`);
    return { cls: className, file, table, columns: extractColumns(entitySource) };
  });
}

/** Migration history is append-only but naming is intentionally more permissive than the donor. */
export function migrations(root) {
  return walk(root, MIGRATIONS_DIR, { ext: '.ts' }).map((file) => {
    const source = readText(fromRoot(root, file));
    const base = path.posix.basename(file, '.ts');
    const timestamp = base.match(/^(\d+)/)?.[1] ?? null;
    const tables = new Set();
    for (const match of source.matchAll(CREATE_TABLE_RE)) tables.add(match[1]);
    for (const match of source.matchAll(TABLE_OBJECT_RE)) tables.add(match[1]);
    return {
      ts: timestamp,
      name: base,
      cls: source.match(MIGRATION_CLASS_RE)?.[1] ?? null,
      file,
      tables: sortBy([...tables]),
    };
  });
}

/** Concrete external listing sources are the only provider class asserted by this adapter. */
export function providers(root) {
  const providers = [];
  for (const file of walk(root, 'src', { ext: '.ts' })) {
    const source = readText(fromRoot(root, file));
    for (const match of source.matchAll(CLASS_RE)) {
      if (!/\bListingSource\b/.test(match[2])) continue;
      const classBody = source.slice(match.index);
      providers.push({
        cls: match[1],
        source: classBody.match(KEY_RE)?.[1] ?? null,
        file,
      });
    }
  }
  return sortBy(providers, (provider) => `${provider.file}\0${provider.cls}`);
}

/** Environment facts are read from the actual configuration function and `.env.example`. */
export function envVars(root) {
  const used = new Set();
  for (const file of walk(root, 'src', { ext: '.ts' })) {
    const source = readText(fromRoot(root, file));
    for (const match of source.matchAll(ENV_USE_RE)) used.add(match[1]);
  }

  // Configuration is deliberately read even if no process.env literal is found in a future refactor:
  // a missing file means the adapter's source-of-truth contract has changed and must be reviewed.
  readText(fromRoot(root, CONFIGURATION));
  const documented = new Set();
  const defaults = new Map();
  const example = readText(fromRoot(root, ENV_EXAMPLE));
  for (const line of example.split('\n')) {
    const match = line.match(ENV_LINE_RE);
    if (!match) continue;
    documented.add(match[1]);
    defaults.set(match[1], match[2].trim());
  }

  const usedList = sortBy([...used]);
  const documentedList = sortBy([...documented]);
  return {
    used: usedList,
    documented: documentedList,
    defaults,
    missing: usedList.filter((name) => !documented.has(name)),
  };
}

const KIND = {
  'abstract class': 'class',
  class: 'class',
  'async function': 'function',
  function: 'function',
  const: 'const',
  interface: 'interface',
  type: 'type',
  enum: 'enum',
};

function mapScope(root, scope, directory, ext = '.ts') {
  return walk(root, directory, { ext })
    .filter((file) => !/\.d\.ts$/.test(file))
    .map((file) => {
      const source = readText(fromRoot(root, file));
      const symbols = [...source.matchAll(EXPORT_RE)].map((match) => ({
        kind: KIND[match[1]],
        name: match[2],
      }));
      const relative = path.posix.relative(directory, file);
      return {
        file,
        scope,
        dir: path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative),
        base: path.posix.basename(relative),
        symbols,
      };
    });
}

/** A compact navigation map, not a semantic parser or an assertion about non-exported code. */
export function codeMap(root) {
  return sortBy(
    [
      ...mapScope(root, 'src', 'src'),
      ...mapScope(root, 'test', 'test'),
      ...mapScope(root, 'tools/vault', 'tools/vault', '.mjs'),
    ],
    (row) => `${row.scope}\0${row.dir}\0${row.base}`,
  );
}

export function npmScripts(root) {
  const packageJson = JSON.parse(readText(fromRoot(root, 'package.json')));
  return new Map(Object.entries(packageJson.scripts ?? {}));
}

function analyseTests(root, files) {
  let cases = 0;
  let skipped = 0;
  let hasEach = false;
  const byDir = {};
  const only = [];
  for (const file of files) {
    const source = readText(fromRoot(root, file));
    const count = [...source.matchAll(/^\s*(?:it|test)\s*\(/gm)].length;
    cases += count;
    skipped += [...source.matchAll(/\b(?:it|test|describe)\.(?:skip|todo)\b/g)].length;
    hasEach ||= /\b(?:it|test|describe)\.each\b/.test(source);
    const group = path.posix.dirname(file).split('/').pop() || '(root)';
    byDir[group] = (byDir[group] ?? 0) + count;
    source.split('\n').forEach((line, index) => {
      if (/\b(?:it|test|describe)\.only\b|\bfit\s*\(|\bftest\s*\(/.test(line))
        only.push(`${file}:${index + 1}`);
    });
  }
  return { cases, files: files.length, byDir, skipped, only, hasEach };
}

/** Unit and integration counts are orientation only; contract tests remain visible through codeMap. */
export function testCounts(root) {
  const files = walk(root, 'test', { ext: '.ts' });
  const unitFiles = files.filter((file) => file.includes('/unit/'));
  const integrationFiles = files.filter((file) => file.includes('/integration/'));
  const unit = analyseTests(root, unitFiles);
  const int = analyseTests(root, integrationFiles);
  return {
    unit,
    int,
    hasEach: unit.hasEach || int.hasEach,
    only: sortBy([...unit.only, ...int.only]),
    skipped: unit.skipped + int.skipped,
  };
}
