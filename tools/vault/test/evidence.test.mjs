import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  CACHE_RELATIVE_PATH,
  RegistryError,
  evidence,
  measure,
  readRegistry,
} from '../lib/evidence.mjs';

const VALID_SQL = 'SELECT 4::float8 AS value, 9 AS n';

function fixture(lines) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vault-evidence-'));
  const vault = path.join(root, 'knowledge');
  mkdirSync(vault, { recursive: true });
  writeFileSync(path.join(vault, '_metrics.tsv'), `${lines.join('\n')}\n`, 'utf8');
  return { root, config: { vaultDir: 'knowledge' } };
}

function metricLine({
  key = 'sample_metric',
  target = 'Roadmap: sample',
  trigger = '>= 4',
  question = 'Is there enough sample data?',
  sql = VALID_SQL,
} = {}) {
  return [key, target, trigger, question, sql].join('\t');
}

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      if (/^SELECT\b/i.test(sql)) return result;
      return { fields: [], rows: [], rowCount: 0 };
    },
  };
}

test('dry evidence validates the configured registry without database access or cache writes', async (t) => {
  const { root, config } = fixture([metricLine()]);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = await evidence(root, config, { dry: true, silent: true });

  assert.equal(result, 0);
  assert.equal(existsSync(path.join(root, CACHE_RELATIVE_PATH)), false);
});

test('a missing database remains an advisory runner failure and does not write a cache', async (t) => {
  const { root, config } = fixture([metricLine()]);
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  t.after(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    rmSync(root, { recursive: true, force: true });
  });

  const result = await evidence(root, config, { silent: true });

  assert.equal(result, 1);
  assert.equal(existsSync(path.join(root, CACHE_RELATIVE_PATH)), false);
});

test('registry rejects write-like and multi-statement SQL before a client is created', (t) => {
  const { root, config } = fixture([
    metricLine({ sql: 'SELECT 1::float8 AS value, 1 AS n; DELETE FROM private_data' }),
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.throws(() => readRegistry(root, config), RegistryError);
  assert.throws(() => readRegistry(root, config), /one statement/);
});

test('measure uses one READ ONLY transaction, a timeout, and result-column privacy bounds', async (t) => {
  const { root, config } = fixture([metricLine()]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const [metric] = readRegistry(root, config);
  const client = fakeClient({
    fields: [{ name: 'value' }, { name: 'n' }],
    rowCount: 1,
    rows: [{ value: '4', n: '9' }],
  });

  const rows = await measure(client, [metric]);

  assert.deepEqual(
    rows.map(({ key, value, n, error }) => ({ key, value, n, error })),
    [{ key: 'sample_metric', value: 4, n: 9, error: null }],
  );
  assert.equal(client.calls[0], 'BEGIN READ ONLY');
  assert.match(client.calls[1], /^SET LOCAL statement_timeout = '15000ms'$/);
  assert.equal(client.calls[2], 'SAVEPOINT vault_metric');
  assert.equal(client.calls[3], VALID_SQL);
  assert.equal(client.calls[4], 'RELEASE SAVEPOINT vault_metric');
  assert.equal(client.calls[5], 'COMMIT');
});

test('measure never emits a row value when a metric returns a disallowed column', async (t) => {
  const { root, config } = fixture([metricLine()]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const [metric] = readRegistry(root, config);
  const client = fakeClient({
    fields: [{ name: 'value' }, { name: 'private_payload' }],
    rowCount: 1,
    rows: [{ value: 'operator@example.test', private_payload: 'secret' }],
  });

  const [row] = await measure(client, [metric]);

  assert.equal(row.value, null);
  assert.equal(row.n, null);
  assert.match(row.error, /exactly the numeric columns value and n/);
  assert.doesNotMatch(row.error, /operator@example|secret|private_payload/);
  assert.ok(client.calls.includes('ROLLBACK TO SAVEPOINT vault_metric'));
  assert.equal(client.calls.at(-1), 'COMMIT');
});

test('the repository metric registry remains parseable without a database', () => {
  const root = process.cwd();
  const metrics = readRegistry(root, { vaultDir: 'knowledge-offers-analyzer' });

  assert.ok(metrics.length >= 3);
  assert.deepEqual(
    metrics.map((metric) => metric.key),
    ['closed_deals_for_review', 'eligible_disappearances', 'budget_denial_share'],
  );
});
