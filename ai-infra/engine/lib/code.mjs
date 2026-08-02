/**
 * Optional adapter seam. The core requires no source-tree schema: an adapter
 * explicitly advertises only the capabilities it implements.
 *
 * Supported capability methods:
 * - sourceFacts(root, config) -> { sections: [{ title, rows: string[] }] }
 * - codeMap(root, config) -> [{ scope?, dir?, base?, file?, symbols? }]
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const CAPABILITIES = Object.freeze(['sourceFacts', 'codeMap']);

function adapterUrl(config) {
  if (config.adapter === 'none') return new URL('../adapters/none.mjs', import.meta.url).href;
  return pathToFileURL(path.resolve(config.root, config.adapter)).href;
}

function normalizeSections(value) {
  if (value === undefined || value === null) return [];
  const sections = Array.isArray(value) ? value : value.sections;
  if (!Array.isArray(sections)) throw new Error('sourceFacts must return { sections: [...] }');
  return sections.map((section, index) => {
    if (!section || typeof section !== 'object' || Array.isArray(section))
      throw new Error(`sourceFacts.sections[${index}] must be an object`);
    const title = String(section.title || '').trim();
    if (!title) throw new Error(`sourceFacts.sections[${index}].title must be non-empty`);
    if (!Array.isArray(section.rows) || !section.rows.every((row) => typeof row === 'string'))
      throw new Error(`sourceFacts.sections[${index}].rows must be strings`);
    return Object.freeze({ title, rows: Object.freeze([...section.rows]) });
  });
}

function normalizeCodeMap(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('codeMap must return an array');
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw new Error(`codeMap[${index}] must be an object`);
    const file = String(row.file || row.base || '').trim();
    if (!file) throw new Error(`codeMap[${index}] needs file or base`);
    const symbols = row.symbols === undefined ? [] : row.symbols;
    if (
      !Array.isArray(symbols) ||
      !symbols.every((symbol) => symbol && typeof symbol.name === 'string')
    )
      throw new Error(`codeMap[${index}].symbols must contain named objects`);
    return Object.freeze({
      scope: row.scope ? String(row.scope) : '',
      dir: row.dir ? String(row.dir) : '',
      base: row.base ? String(row.base) : '',
      file,
      symbols: Object.freeze(
        symbols.map((symbol) =>
          Object.freeze({ kind: symbol.kind ? String(symbol.kind) : 'symbol', name: symbol.name }),
        ),
      ),
    });
  });
}

export async function loadAdapter(config) {
  const adapter = await import(adapterUrl(config));
  const advertised = adapter.capabilities === undefined ? {} : adapter.capabilities;
  if (!advertised || typeof advertised !== 'object' || Array.isArray(advertised))
    throw new Error(`adapter '${config.adapter}' must export a capabilities object`);
  const capabilities = {};
  for (const name of CAPABILITIES) {
    capabilities[name] = advertised[name] === true;
    if (capabilities[name] && typeof adapter[name] !== 'function')
      throw new Error(`adapter '${config.adapter}' advertises '${name}' but does not export it`);
  }
  for (const [name, enabled] of Object.entries(advertised)) {
    if (!CAPABILITIES.includes(name) && enabled)
      throw new Error(`adapter '${config.adapter}' advertises unknown capability '${name}'`);
  }
  return { adapter, capabilities: Object.freeze(capabilities) };
}

/** Omit unsupported facts; an adapter error is never replaced with a guess. */
export async function collectCapabilities(root, config) {
  const { adapter, capabilities } = await loadAdapter(config);
  const [sourceFacts, codeMap] = await Promise.all([
    capabilities.sourceFacts
      ? Promise.resolve(adapter.sourceFacts(root, config)).then(normalizeSections)
      : [],
    capabilities.codeMap
      ? Promise.resolve(adapter.codeMap(root, config)).then(normalizeCodeMap)
      : [],
  ]);
  return Object.freeze({ sourceFacts, codeMap, capabilities });
}
