import { readdirSync } from 'fs';
import { join } from 'path';

import { getMetadataArgsStorage } from 'typeorm';

import { ENTITIES } from '../../src/common/database/data-source';

const SRC_DIR = join(__dirname, '..', '..', 'src');

/** A decorated entity class, as stored in TypeORM's metadata args storage. */
type EntityClass = (abstract new (...args: never[]) => object) & { name: string };

/** Recursively collect every `*.entity.ts` file under `src/`. */
function findEntityFiles(dir: string): string[] {
  const found: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      found.push(...findEntityFiles(full));
    } else if (item.name.endsWith('.entity.ts')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * `ENTITIES` (data-source.ts) is the single source of truth for the datasource.
 * `TypeOrmModule.forFeature()` does NOT register an entity with the connection —
 * it only creates a repository provider that resolves lazily, so a missing entry
 * here boots fine and then fails on the first query with
 * `EntityMetadataNotFoundError`. This test closes that gap at build time.
 */
describe('ENTITIES registry', () => {
  it('registers every @Entity class defined under src/', () => {
    // Importing the files runs their decorators, populating the metadata storage.
    for (const file of findEntityFiles(SRC_DIR)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(file);
    }

    const decorated = getMetadataArgsStorage()
      .tables.map((table) => table.target)
      .filter((target): target is EntityClass => typeof target === 'function');

    const registered = new Set<EntityClass>(ENTITIES);
    const missing = [...new Set(decorated)]
      .filter((target) => !registered.has(target))
      .map((target) => target.name)
      .sort();

    expect(missing).toEqual([]);
  });
});
