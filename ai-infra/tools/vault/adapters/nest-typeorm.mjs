/**
 * NestJS + TypeORM + Jest adapter. Selected by `"adapter": "nest-typeorm"` in
 * vault.config.json; see lib/code.mjs for the interface every adapter exports.
 *
 * Backend source-of-truth extraction: entities, migrations, providers, env
 * vars, npm scripts, test counts. Every fact here is read straight out of
 * the configured code root (its `src/`, `.env.example`, `package.json`) with
 * plain regex/text scanning — no TS compiler, no glob discovery beyond what
 * `fs.mjs#walk` already gives us. Where the source can drift silently (the
 * TypeORM `entities: [...]` array), we hard-fail instead of guessing: an
 * adapter that was explicitly SELECTED and cannot parse is a real error, and
 * silently returning nothing would show up as a quietly shrinking L1 pack.
 */
import * as path from 'node:path';
import { BACKEND_DIR, toPosix, readText, walk, sortBy } from '../lib/fs.mjs';

const ENTITIES_ARRAY_RE = /entities\s*:\s*\[([^\]]*)\]/g;
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const ENTITY_TABLE_RE = /@Entity\(\s*['"]([^'"]+)['"]/;
const COLUMN_DECORATOR_RE = /@(Column|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\b\s*\(/g;
const PROVIDER_CLASS_RE = /export class (\w+)\s+implements\s+TransactionProvider\b/g;
const PROVIDER_SOURCE_RE = /readonly\s+source\s*=\s*['"]([^'"]+)['"]/;
const ENV_USE_RE = /\benv\.([A-Z][A-Z0-9_]*)/g;
const ENV_EXAMPLE_LINE_RE = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/;
const MIGRATION_FILENAME_RE = /^(\d+)-(.+)\.ts$/;
const MIGRATION_CLASS_RE = /export class (\w+)/;
const CREATE_TABLE_RE = /CREATE TABLE\s+"(\w+)"/g;

/** Find the matching `)` for the `(` at `text[openIndex]`, depth-balanced. */
function extractParenArgs(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { args: text.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  throw new Error(`code.mjs: unbalanced parentheses starting at index ${openIndex}`);
}

/** SQL/TS column type from a `@Column(...)`-family decorator's argument text. */
function decoratorType(args) {
  const quoted = args.trim().match(/^['"]([^'"]+)['"]/);
  if (quoted) return quoted[1];
  const typeField = args.match(/\btype\s*:\s*['"]([^'"]+)['"]/);
  if (typeField) return typeField[1];
  return null;
}

/** Every `@Column`/`@PrimaryGeneratedColumn`/`@CreateDateColumn`/`@UpdateDateColumn` in a file. */
function extractColumns(fileText) {
  const columns = [];
  const re = new RegExp(COLUMN_DECORATOR_RE.source, 'g');
  let m;
  while ((m = re.exec(fileText))) {
    const openIndex = m.index + m[0].length - 1; // index of '('
    const { args, end } = extractParenArgs(fileText, openIndex);
    const propMatch = fileText.slice(end).match(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/);
    if (!propMatch) continue; // decorator not directly followed by a property; not one of ours
    columns.push({ name: propMatch[1], type: decoratorType(args) });
    re.lastIndex = end;
  }
  return columns;
}

/**
 * TypeORM entities registered in `database.config.ts`'s literal `entities:
 * [...]` array, resolved through that file's own imports to a source file,
 * with table name + columns read back out of each entity class.
 */
export function entities(root) {
  const configRel = `${BACKEND_DIR}/src/config/database.config.ts`;
  const configText = readText(path.resolve(root, configRel));

  const arrayMatches = [...configText.matchAll(new RegExp(ENTITIES_ARRAY_RE.source, 'g'))];
  if (arrayMatches.length !== 1) {
    throw new Error(
      `code.mjs: expected exactly one "entities: [...]" literal in ${configRel}, found ${arrayMatches.length}`,
    );
  }
  const classNames = arrayMatches[0][1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const importMap = new Map();
  for (const m of configText.matchAll(new RegExp(IMPORT_RE.source, 'g'))) {
    for (const n of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      importMap.set(n, m[2]);
    }
  }

  const configDir = path.posix.dirname(toPosix(configRel));

  return classNames.map((cls) => {
    const spec = importMap.get(cls);
    if (!spec) {
      throw new Error(`code.mjs: entity class "${cls}" has no matching import in ${configRel}`);
    }
    const file = toPosix(path.posix.join(configDir, spec)) + '.ts';
    const fileText = readText(path.resolve(root, file));

    const tableMatch = fileText.match(ENTITY_TABLE_RE);
    if (!tableMatch) {
      throw new Error(`code.mjs: no @Entity(...) decorator found in ${file}`);
    }

    return { cls, file, table: tableMatch[1], columns: extractColumns(fileText) };
  });
}

/** Migrations under `backend/src/database/migrations`, cross-checked filename vs class. */
export function migrations(root) {
  const dir = `${BACKEND_DIR}/src/database/migrations`;
  const files = walk(root, dir, { ext: '.ts' });
  const out = [];

  for (const file of files) {
    const base = path.posix.basename(file);
    const nameMatch = base.match(MIGRATION_FILENAME_RE);
    if (!nameMatch) {
      throw new Error(`code.mjs: migration file "${file}" does not match "<digits>-<Name>.ts"`);
    }
    const [, ts, name] = nameMatch;

    const text = readText(path.resolve(root, file));
    const clsMatch = text.match(MIGRATION_CLASS_RE);
    const cls = clsMatch ? clsMatch[1] : null;
    const expectedCls = `${name}${ts}`;
    if (cls !== expectedCls) {
      throw new Error(
        `code.mjs: migration class mismatch in ${file}: filename implies "${expectedCls}", found "${cls}"`,
      );
    }

    const downIdx = text.indexOf('public async down');
    const upText = downIdx === -1 ? text : text.slice(0, downIdx);
    const tables = [...upText.matchAll(new RegExp(CREATE_TABLE_RE.source, 'g'))].map((m) => m[1]);

    out.push({ ts, name, cls, file, tables });
  }

  return sortBy(out, (mig) => mig.ts);
}

/** `TransactionProvider` implementations under `backend/src/providers`. */
export function providers(root) {
  const dir = `${BACKEND_DIR}/src/providers`;
  const files = walk(root, dir, { ext: '.ts' });
  const out = [];

  for (const file of files) {
    const text = readText(path.resolve(root, file));
    for (const m of text.matchAll(new RegExp(PROVIDER_CLASS_RE.source, 'g'))) {
      const sourceMatch = text.match(PROVIDER_SOURCE_RE);
      out.push({ cls: m[1], file, source: sourceMatch ? sourceMatch[1] : null });
    }
  }

  return out;
}

/**
 * `env.FOO` identifiers used across `backend/src`, cross-checked against
 * `backend/.env.example` (both `X=v` and commented `# X=v` forms). Default
 * VALUES come only from `.env.example` text — never inferred from code.
 */
export function envVars(root) {
  const files = walk(root, `${BACKEND_DIR}/src`, { ext: '.ts' });
  const usedSet = new Set();
  for (const file of files) {
    const text = readText(path.resolve(root, file));
    for (const m of text.matchAll(new RegExp(ENV_USE_RE.source, 'g'))) usedSet.add(m[1]);
  }

  const exampleText = readText(path.resolve(root, `${BACKEND_DIR}/.env.example`));
  const documentedSet = new Set();
  const defaults = new Map();
  for (const line of exampleText.split('\n')) {
    const m = line.match(ENV_EXAMPLE_LINE_RE);
    if (!m) continue;
    documentedSet.add(m[1]);
    defaults.set(m[1], m[2].trim());
  }

  const used = sortBy([...usedSet]);
  const documented = sortBy([...documentedSet]);
  const missing = sortBy(used.filter((v) => !documentedSet.has(v)));
  const undocumented = sortBy(documented.filter((v) => !usedSet.has(v)));

  return { used, documented, defaults, missing, undocumented };
}

/**
 * Exported symbols per source file — the code-side counterpart to the note map.
 *
 * The vault indexes 25 notes; agents still entered `backend/src` blind and
 * grepped. This is the same zero-token derivation applied to the surface that
 * actually dominates token spend.
 *
 * Spec files are excluded: they export nothing an agent needs to address, and
 * including them would roughly double the artifact for no retrieval value.
 * The `kind` set is closed to the six forms that actually occur in this
 * codebase; anything else is silently not a symbol, which is the right failure
 * mode for a map (a missing line costs a grep, a wrong line costs trust).
 */
const EXPORT_RE =
  /^export\s+(?:default\s+)?(abstract class|class|async function|function|const|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;

const KIND_TAG = {
  'abstract class': 'cls',
  class: 'cls',
  'async function': 'fn',
  function: 'fn',
  const: 'const',
  interface: 'iface',
  type: 'type',
  enum: 'enum',
};

/**
 * What the map covers. `tools/vault` is in here because it was the single
 * largest UNINDEXED surface in the repo: profiling a session showed ~15k tokens
 * (53% of all Read cost) spent reading the tooling in full, purely because the
 * indexer did not index itself. Adding a scope is cheaper than any amount of
 * discipline about not grepping.
 *
 * `skip` is per-scope: specs are noise in `backend/src`, but `tools/vault` has
 * no spec convention, so one shared regex would misdescribe both.
 */
const MAP_SCOPES = [
  { label: 'src', dir: `${BACKEND_DIR}/src`, ext: '.ts', skip: /\.(int-)?spec\.ts$/ },
  { label: 'tools/vault', dir: 'tools/vault', ext: '.mjs', skip: null },
];

export function codeMap(root) {
  const out = [];
  for (const scope of MAP_SCOPES) out.push(...scopeMap(root, scope));
  return out;
}

/** One scope's rows, sorted. Scopes are concatenated in declaration order. */
function scopeMap(root, scope) {
  // Both spec flavours: `.int-spec.ts` does NOT match /\.spec\.ts$/, and letting
  // them through adds a dozen symbol-less rows of pure noise.
  const files = walk(root, scope.dir, { ext: scope.ext }).filter((f) => !scope.skip?.test(f));
  const srcPrefix = `${scope.dir}/`;
  const out = [];

  for (const file of files) {
    const text = readText(path.resolve(root, file));
    const symbols = [];
    for (const m of text.matchAll(new RegExp(EXPORT_RE.source, 'gm'))) {
      symbols.push({ kind: KIND_TAG[m[1]], name: m[2] });
    }
    const rel = file.startsWith(srcPrefix) ? file.slice(srcPrefix.length) : file;
    const dirname = path.posix.dirname(rel);
    out.push({
      file,
      rel,
      scope: scope.label,
      dir: dirname === '.' ? '' : dirname,
      base: path.posix.basename(rel),
      symbols,
    });
  }

  // Sort by directory FIRST, then filename. Sorting on the full relative path
  // interleaves root files with subdirectories ("main.ts" falls between
  // "config/" and "matching/"), which splits a single directory into several
  // headings in the rendered map.
  return sortBy(out, (x) => `${x.dir}\0${x.base}`);
}

/** `backend/package.json`'s `scripts` map, as-is. */
export function npmScripts(root) {
  const text = readText(path.resolve(root, `${BACKEND_DIR}/package.json`));
  const pkg = JSON.parse(text);
  return new Map(Object.entries(pkg.scripts ?? {}));
}

/**
 * Jest case counts under `backend/src`: `*.int-spec.ts` -> int, `*.spec.ts`
 * (excluding `*.int-spec.ts`) -> unit. `hasEach` flags `.each` usage anywhere
 * in the scanned set (case counts become a lower bound when true — the caller
 * must never read them as exact in that case). `only` collects `.only` /
 * `fit(` / `ftest(` occurrences as `file:line` — a defect in its own right.
 */
export function testCounts(root) {
  const files = walk(root, `${BACKEND_DIR}/src`, { ext: '.ts' });
  const unitFiles = files.filter((f) => /\.spec\.ts$/.test(f) && !/\.int-spec\.ts$/.test(f));
  const intFiles = files.filter((f) => /\.int-spec\.ts$/.test(f));
  const srcPrefix = `${BACKEND_DIR}/src/`;

  function analyze(fileList) {
    let cases = 0;
    let hasEach = false;
    let skipped = 0;
    const byDir = {};
    const only = [];

    for (const file of fileList) {
      const text = readText(path.resolve(root, file));

      const fileCases = [...text.matchAll(/^\s*(it|test)\(/gm)].length;
      cases += fileCases;

      if (/\b(it|test|describe)\.each\b/.test(text)) hasEach = true;
      skipped += [...text.matchAll(/\b(it|test|describe)\.(skip|todo)\b/g)].length;

      text.split('\n').forEach((line, idx) => {
        if (
          /\b(it|test|describe)\.only\b/.test(line) ||
          /\bfit\s*\(/.test(line) ||
          /\bftest\s*\(/.test(line)
        ) {
          only.push(`${file}:${idx + 1}`);
        }
      });

      const relToSrc = file.startsWith(srcPrefix) ? file.slice(srcPrefix.length) : file;
      const dirname = path.posix.dirname(relToSrc);
      const group = dirname === '.' ? '(root)' : dirname.split('/').pop();
      byDir[group] = (byDir[group] ?? 0) + fileCases;
    }

    return { cases, files: fileList.length, byDir, hasEach, skipped, only };
  }

  const unit = analyze(unitFiles);
  const int = analyze(intFiles);

  return {
    unit: { cases: unit.cases, files: unit.files, byDir: unit.byDir },
    int: { cases: int.cases, files: int.files, byDir: int.byDir },
    hasEach: unit.hasEach || int.hasEach,
    only: [...unit.only, ...int.only],
    skipped: unit.skipped + int.skipped,
  };
}
