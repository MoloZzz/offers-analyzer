/**
 * Adapter loader — the seam between the vault engine and one project's stack.
 *
 * Everything the engine knows about source code arrives through these seven
 * functions, each `(root) -> data`:
 *
 *   entities(root)     -> [{ cls, table, columns }]
 *   migrations(root)   -> [{ ts, cls, name, tables }]
 *   providers(root)    -> [{ cls, source }]
 *   envVars(root)      -> { used: string[], defaults: Map, missing: string[] }
 *   codeMap(root)      -> rows for _gen/code-map.txt
 *   npmScripts(root)   -> Set<string>
 *   testCounts(root)   -> { unit, int, hasEach } with { cases, files } per side
 *
 * `adapters/none.mjs` is the reference for the empty shape of each; a stack
 * adapter that cannot parse its own source hard-fails rather than returning
 * empty, because it was named in the config on purpose.
 *
 * The adapter is resolved with top-level await. That keeps every exported
 * function synchronous — no caller changes — while still allowing a config to
 * name a project-local `.mjs` file that was never bundled here. hook.mjs does
 * not import this module, so hooks pay nothing for it.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG, CONFIG_ROOT, CONFIG_FILE } from './config.mjs';

/** Adapters shipped with the tooling. A config may also give a path instead. */
const BUNDLED = ['nest-typeorm', 'none'];

const REQUIRED = [
  'entities',
  'migrations',
  'providers',
  'envVars',
  'codeMap',
  'npmScripts',
  'testCounts',
];

function specifier(name) {
  // A path (relative or absolute) is a project-local adapter; anything else
  // must be one of ours, so a typo is caught here instead of surfacing as a
  // confusing module-not-found from deep inside the resolver.
  if (name.startsWith('.') || name.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(name)) {
    return pathToFileURL(path.resolve(CONFIG_ROOT ?? process.cwd(), name)).href;
  }
  if (!BUNDLED.includes(name)) {
    throw new Error(
      `unknown adapter '${name}' in ${CONFIG_FILE} — bundled adapters are ${BUNDLED.join(', ')}, ` +
        `or give a path such as "./tools/my-adapter.mjs"`,
    );
  }
  return new URL(`../adapters/${name}.mjs`, import.meta.url).href;
}

const adapter = await import(specifier(CONFIG.adapter));

const missing = REQUIRED.filter((fn) => typeof adapter[fn] !== 'function');
if (missing.length) {
  throw new Error(`adapter '${CONFIG.adapter}' does not export: ${missing.join(', ')}`);
}

export const entities = adapter.entities;
export const migrations = adapter.migrations;
export const providers = adapter.providers;
export const envVars = adapter.envVars;
export const codeMap = adapter.codeMap;
export const npmScripts = adapter.npmScripts;
export const testCounts = adapter.testCounts;
