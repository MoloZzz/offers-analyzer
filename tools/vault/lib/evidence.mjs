/**
 * Read-only product evidence runner.
 *
 * This module is deliberately separate from `vault check`: a repository can be
 * structurally healthy while a developer machine has no database.  The runner
 * validates a committed metric registry, then (only when explicitly invoked)
 * evaluates its narrow SELECT queries in one PostgreSQL READ ONLY transaction.
 * Its only write is a local, gitignored cache at tools/vault/.evidence.tsv.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { shortDigest, toPosix } from './fs.mjs';

export class RegistryError extends Error {}

export const CACHE_RELATIVE_PATH = 'tools/vault/.evidence.tsv';
const DEFAULT_VAULT_DIR = 'vault';
const STATEMENT_TIMEOUT_MS = 15_000;
const TRIGGER_RX = /^(>=|<=|<>|>|<|=)\s*(-?\d+(?:\.\d+)?)$/;

// A registry is reviewed source code, not an arbitrary SQL sandbox.  This
// conservative parser is still valuable: it turns an accidental write query
// into a local validation error before it reaches PostgreSQL.  PostgreSQL's
// READ ONLY transaction below is the actual server-side enforcement.
const FORBIDDEN_SQL =
  /\b(?:insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|analyze|lock|set|reset|begin|commit|rollback|declare|fetch|listen|notify|unlisten|prepare|execute|deallocate|into)\b/i;

function vaultDir(config) {
  return typeof config?.vaultDir === 'string' && config.vaultDir.trim()
    ? config.vaultDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    : DEFAULT_VAULT_DIR;
}

export function registryRelativePath(config) {
  return `${vaultDir(config)}/_metrics.tsv`;
}

function registryPath(root, config) {
  return path.resolve(root, registryRelativePath(config));
}

function boundedText(value, limit = 220) {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return boundedText(message || 'unknown measurement failure', 240);
}

function parseTrigger(raw, key, where) {
  if (raw === '-') return null;
  const match = TRIGGER_RX.exec(raw.trim());
  if (!match) {
    throw new RegistryError(`${where}: metric '${key}' has invalid trigger '${raw}'`);
  }
  const [, operator, rawBound] = match;
  const bound = Number(rawBound);
  const predicates = {
    '>': (value) => value > bound,
    '<': (value) => value < bound,
    '>=': (value) => value >= bound,
    '<=': (value) => value <= bound,
    '=': (value) => value === bound,
    '<>': (value) => value !== bound,
  };
  return Object.freeze({ text: raw.trim(), fires: predicates[operator] });
}

function validateSql(sql, key, where) {
  if (!sql) throw new RegistryError(`${where}: metric '${key}' has no SQL`);
  if (!/^select\b/i.test(sql)) {
    throw new RegistryError(`${where}: metric '${key}' must start with SELECT`);
  }
  if (sql.includes(';')) {
    throw new RegistryError(
      `${where}: metric '${key}' must contain exactly one statement (no semicolon)`,
    );
  }
  const forbidden = FORBIDDEN_SQL.exec(sql);
  if (forbidden) {
    throw new RegistryError(
      `${where}: metric '${key}' contains forbidden SQL keyword '${forbidden[0].toUpperCase()}'`,
    );
  }
  if (/\bfor\s+(?:update|share|no\s+key\s+update|key\s+share)\b/i.test(sql)) {
    throw new RegistryError(`${where}: metric '${key}' must not request row locks`);
  }
}

/**
 * Parse a metric registry with exactly five TSV columns:
 * key, roadmap target, trigger, operator question, SQL.
 *
 * `value` and `n` are intentionally enforced at query-result time rather than
 * trusted in prose.  A registry validates without any database connection.
 */
export function readRegistry(root, config = {}) {
  const relative = registryRelativePath(config);
  const file = registryPath(root, config);
  if (!existsSync(file)) throw new RegistryError(`missing ${relative}`);

  const metrics = [];
  const seen = new Set();
  const lines = readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const columns = raw.split('\t');
    const where = `${relative}:${index + 1}`;
    if (columns.length !== 5) {
      throw new RegistryError(`${where}: expected 5 tab-separated columns, got ${columns.length}`);
    }

    const [key, roadmapTarget, rawTrigger, question, sql] = columns.map((field) => field.trim());
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new RegistryError(`${where}: metric key '${key}' must be lower_snake_case`);
    }
    if (seen.has(key)) throw new RegistryError(`${where}: duplicate metric key '${key}'`);
    seen.add(key);
    if (!roadmapTarget) throw new RegistryError(`${where}: metric '${key}' has no roadmap target`);
    if (!question) throw new RegistryError(`${where}: metric '${key}' has no operator question`);
    validateSql(sql, key, where);

    metrics.push(
      Object.freeze({
        key,
        roadmapTarget,
        question,
        sql,
        trigger: parseTrigger(rawTrigger, key, where),
        line: index + 1,
      }),
    );
  }

  if (!metrics.length) throw new RegistryError(`${relative}: no metrics defined`);
  return Object.freeze(metrics);
}

export function registryDigest(metrics) {
  return shortDigest(
    metrics
      .map(
        (metric) =>
          `${metric.key}\t${metric.roadmapTarget}\t${metric.trigger?.text || '-'}\t${metric.sql}`,
      )
      .join('\n'),
  );
}

function parseEnvValue(text) {
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }
  return null;
}

/** DATABASE_URL comes from the current process first, then the repository .env. */
export function databaseUrl(root) {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const envFile = path.resolve(root, '.env');
  if (!existsSync(envFile)) return null;
  return parseEnvValue(readFileSync(envFile, 'utf8')) || null;
}

function loadPg(root) {
  try {
    // The application owns its dependencies.  The vault engine does not add a
    // second package manifest or pull a driver into projects that never invoke evidence.
    return createRequire(path.resolve(root, 'package.json'))('pg');
  } catch {
    return null;
  }
}

function numberFrom(raw, label) {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label} is not a finite number`);
  return value;
}

function resultRow(result) {
  const fields = Array.isArray(result?.fields) ? result.fields.map((field) => field.name) : [];
  const allowed = new Set(['value', 'n']);
  const unique = new Set(fields);
  const illegal = fields.filter((name) => !allowed.has(name));
  if (illegal.length || unique.size !== 2 || !unique.has('value') || !unique.has('n')) {
    throw new Error('must return exactly the numeric columns value and n');
  }
  if (result.rowCount !== 1 || !Array.isArray(result.rows) || result.rows.length !== 1) {
    throw new Error(`returned ${result?.rowCount ?? 0} rows, expected exactly 1`);
  }

  const value = numberFrom(result.rows[0].value, 'value');
  const n = numberFrom(result.rows[0].n, 'n');
  if (n === null || n < 0 || !Number.isInteger(n)) {
    throw new Error('n must be a non-negative integer sample size');
  }
  return { value, n };
}

/**
 * Execute every metric under one read-only transaction.  Each metric receives
 * a savepoint so a stale query reports its own error without hiding later rows.
 * Exported for testability; callers should use `evidence()`.
 */
export async function measure(client, metrics) {
  const rows = [];
  await client.query('BEGIN READ ONLY');
  try {
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
    for (const metric of metrics) {
      let savepoint = false;
      try {
        await client.query('SAVEPOINT vault_metric');
        savepoint = true;
        const result = await client.query(metric.sql);
        const { value, n } = resultRow(result);
        await client.query('RELEASE SAVEPOINT vault_metric');
        rows.push({ ...metric, value, n, error: null });
      } catch (error) {
        if (savepoint) await client.query('ROLLBACK TO SAVEPOINT vault_metric').catch(() => {});
        rows.push({ ...metric, value: null, n: null, error: safeError(error) });
      }
    }
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

function formatNumber(value) {
  if (value === null || value === undefined) return '-';
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(3);
}

function rowFires(row) {
  if (row.error || !row.trigger || row.value === null) return null;
  return row.trigger.fires(row.value);
}

function reportRows(rows, measuredAt) {
  const lines = [`# evidence measured=${measuredAt} metrics=${rows.length}`, ''];
  for (const row of rows) {
    const fires = row.error ? 'error' : rowFires(row) === null ? '-' : rowFires(row) ? 'yes' : 'no';
    lines.push(
      `${row.key}\tvalue=${formatNumber(row.value)}\tn=${formatNumber(row.n)}\t` +
        `trigger=${row.trigger?.text || '-'}\tfires=${fires}\ttarget=${boundedText(row.roadmapTarget, 120)}`,
    );
    lines.push(`  ${boundedText(row.question, 220)}`);
    if (row.error) lines.push(`  error: ${safeError(row.error)}`);
  }
  const firing = rows.filter((row) => rowFires(row));
  lines.push('');
  lines.push(
    firing.length
      ? `ADVISORY: ${firing.map((row) => row.key).join(', ')} trigger(s) fired; review the named roadmap target(s).`
      : 'ADVISORY: no trigger fired. This never authorizes an automatic product change.',
  );
  return lines.join('\n');
}

function cacheText(metrics, rows, measuredAt) {
  const lines = [
    `# registry\t${registryDigest(metrics)}`,
    '# key\tvalue\tn\ttrigger\tfires\troadmap_target\tmeasured_at',
  ];
  for (const row of rows) {
    const fires = row.error ? 'error' : rowFires(row) === null ? '-' : rowFires(row) ? 'yes' : 'no';
    lines.push(
      [
        row.key,
        row.error ? 'ERR' : formatNumber(row.value),
        row.error ? '-' : formatNumber(row.n),
        row.trigger?.text || '-',
        fires,
        row.roadmapTarget.replace(/[\t\r\n]+/g, ' '),
        measuredAt,
      ].join('\t'),
    );
  }
  return `${lines.join('\n')}\n`;
}

function writeCache(root, metrics, rows, measuredAt) {
  const cache = path.resolve(root, CACHE_RELATIVE_PATH);
  mkdirSync(path.dirname(cache), { recursive: true });
  writeFileSync(cache, cacheText(metrics, rows, measuredAt), 'utf8');
  return toPosix(CACHE_RELATIVE_PATH);
}

function printDry(metrics, config, flags) {
  if (flags.silent) return;
  const data = metrics.map((metric) => ({
    key: metric.key,
    roadmapTarget: metric.roadmapTarget,
    trigger: metric.trigger?.text || null,
    question: metric.question,
  }));
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ registry: registryRelativePath(config), metrics: data }, null, 2)}\n`,
    );
    return;
  }
  process.stdout.write(
    `# ${registryRelativePath(config)}: valid (${metrics.length} metric(s)); no database access or writes\n\n`,
  );
  for (const metric of data) {
    process.stdout.write(
      `${metric.key}\ttarget=${metric.roadmapTarget}\ttrigger=${metric.trigger || '-'}\n`,
    );
    process.stdout.write(`  ${metric.question}\n`);
  }
}

function printMeasured(rows, measuredAt, flags) {
  if (flags.silent) return;
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          measuredAt,
          metrics: rows.map((row) => ({
            key: row.key,
            roadmapTarget: row.roadmapTarget,
            value: row.value,
            n: row.n,
            trigger: row.trigger?.text || null,
            fires: rowFires(row),
            error: row.error,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  process.stdout.write(`${reportRows(rows, measuredAt)}\n`);
}

/**
 * Validate and, unless --dry is passed, measure the configured vault registry.
 *
 * Exit codes: 0 = measured/valid dry run, 1 = local measurement unavailable or
 * all metrics failed, 2 = malformed registry.  A firing trigger remains advice
 * for a human review; it never changes runtime or roadmap state.
 */
export async function evidence(root, config = {}, flags = {}) {
  let metrics;
  try {
    metrics = readRegistry(root, config);
  } catch (error) {
    if (!(error instanceof RegistryError)) throw error;
    if (!flags.silent) process.stderr.write(`evidence: ${error.message}\n`);
    return 2;
  }

  if (flags.dry) {
    printDry(metrics, config, flags);
    return 0;
  }

  const url = databaseUrl(root);
  if (!url) {
    if (!flags.silent)
      process.stderr.write(
        'evidence: DATABASE_URL is unavailable (environment or repository .env); use --dry to validate only.\n',
      );
    return 1;
  }
  const pg = loadPg(root);
  if (!pg?.Client) {
    if (!flags.silent)
      process.stderr.write(
        "evidence: the project's 'pg' dependency is unavailable; install project dependencies first.\n",
      );
    return 1;
  }

  const client = new pg.Client({ connectionString: url });
  let rows;
  try {
    await client.connect();
    rows = await measure(client, metrics);
  } catch (error) {
    if (!flags.silent)
      process.stderr.write(`evidence: measurement failed (${safeError(error)}).\n`);
    return 1;
  } finally {
    await client.end().catch(() => {});
  }

  const measuredAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  printMeasured(rows, measuredAt, flags);
  const cache = writeCache(root, metrics, rows, measuredAt);
  if (!flags.json && !flags.silent) process.stdout.write(`wrote ${cache}\n`);
  return rows.some((row) => !row.error) ? 0 : 1;
}
