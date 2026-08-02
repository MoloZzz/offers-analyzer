/**
 * Adapter seam between project-neutral vault mechanics and a repository's
 * source tree. A project may choose the bundled `none` adapter or point
 * `adapter` at a local ESM file in vault.config.json.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_EXPORTS = [
  'entities',
  'migrations',
  'providers',
  'envVars',
  'codeMap',
  'npmScripts',
  'testCounts',
];

function isPathSpecifier(value) {
  return value.startsWith('.') || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function adapterUrl(config) {
  if (config.adapter === 'none') return new URL('../adapters/none.mjs', import.meta.url).href;
  if (!isPathSpecifier(config.adapter)) {
    throw new Error(
      `unknown adapter '${config.adapter}'; use 'none' or a project-relative ESM path such as './tools/vault/adapters/project.mjs'`,
    );
  }
  return pathToFileURL(path.resolve(config.root, config.adapter)).href;
}

export async function loadAdapter(config) {
  const adapter = await import(adapterUrl(config));
  const missing = REQUIRED_EXPORTS.filter((name) => typeof adapter[name] !== 'function');
  if (missing.length) {
    throw new Error(`adapter '${config.adapter}' does not export: ${missing.join(', ')}`);
  }
  return adapter;
}

export async function collectCodeFacts(root, config) {
  const adapter = await loadAdapter(config);
  const [entities, migrations, providers, env, map, scripts, tests] = await Promise.all([
    adapter.entities(root),
    adapter.migrations(root),
    adapter.providers(root),
    adapter.envVars(root),
    adapter.codeMap(root),
    adapter.npmScripts(root),
    adapter.testCounts(root),
  ]);
  return { entities, migrations, providers, env, codeMap: map, scripts, tests };
}
