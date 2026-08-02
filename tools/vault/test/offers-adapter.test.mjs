import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as adapter from '../adapters/offers-nest-typeorm.mjs';

test('Offers adapter derives source facts from the declared application registries', () => {
  const root = process.cwd();
  const entities = adapter.entities(root);
  const migrations = adapter.migrations(root);
  const providers = adapter.providers(root);
  const environment = adapter.envVars(root);
  const scripts = adapter.npmScripts(root);
  const tests = adapter.testCounts(root);
  const map = adapter.codeMap(root);

  assert.ok(
    entities.some((entity) => entity.cls === 'SearchProfile' && entity.table === 'search_profiles'),
  );
  assert.ok(
    entities.some(
      (entity) =>
        entity.cls === 'ListingDisappearance' && entity.table === 'listing_disappearances',
    ),
  );
  assert.ok(migrations.some((migration) => migration.tables.includes('deal_outcomes')));
  assert.deepEqual(providers, [
    {
      cls: 'AutoRiaSource',
      source: 'auto-ria',
      file: 'src/modules/sources/auto-ria/auto-ria.source.ts',
    },
  ]);
  assert.deepEqual(environment.missing, []);
  assert.equal(scripts.get('vault:build'), 'node tools/vault/v.mjs build');
  assert.ok(tests.unit.files > 0);
  assert.ok(tests.int.files > 0);
  assert.ok(map.some((row) => row.file === 'src/common/database/data-source.ts'));
});

test('Offers adapter fails rather than guessing when a declared entity lacks an @Entity mapping', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'offers-adapter-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'src', 'common', 'database');
  const entity = path.join(root, 'src', 'modules', 'sample', 'entities');
  mkdirSync(source, { recursive: true });
  mkdirSync(entity, { recursive: true });
  writeFileSync(
    path.join(source, 'data-source.ts'),
    "import { BrokenEntity } from '../../modules/sample/entities/broken.entity';\n" +
      'export const ENTITIES = [BrokenEntity];\n',
    'utf8',
  );
  writeFileSync(path.join(entity, 'broken.entity.ts'), 'export class BrokenEntity {}\n', 'utf8');

  assert.throws(() => adapter.entities(root), /@Entity\('table'\) decorator not found/);
});
