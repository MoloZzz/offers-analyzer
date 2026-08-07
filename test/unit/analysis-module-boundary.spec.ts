/**
 * SPEC-017 T002 — the architectural boundary, enforced in CI rather than in review (ADR-0019 §1).
 *
 * `valuation` must never import `analysis`. That physical separation is the whole enforcement of
 * "advisory forever": if the scorer cannot name the module, an accidental scoring dependency is
 * impossible rather than merely unlikely.
 *
 * The polling pipeline is held to the same rule for a different requirement — FR-001. Analysis runs
 * only on an explicit admin action, and the only way that guarantee dies quietly is a poll-time
 * import appearing one day inside a loop over new listings.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

/** Any import that resolves into `src/modules/analysis`, relative or absolute. */
const ANALYSIS_IMPORT = /(?:from|require\()\s*['"][^'"]*(?:\.\.\/analysis|modules\/analysis)[^'"]*['"]/;

function tsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) found.push(...tsFiles(full));
    else if (item.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

function importersOfAnalysis(moduleDir: string): string[] {
  return tsFiles(join(SRC, 'modules', moduleDir))
    .filter((file) => ANALYSIS_IMPORT.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'));
}

describe('SPEC-017 module boundary', () => {
  it('valuation never imports analysis (ADR-0019 §1)', () => {
    expect(importersOfAnalysis('valuation')).toEqual([]);
  });

  it('the polling pipeline never imports analysis, so no automatic invocation can exist (FR-001)', () => {
    expect(importersOfAnalysis('polling')).toEqual([]);
  });

  it('the guard would actually fire — the pattern matches a real import line', () => {
    expect(ANALYSIS_IMPORT.test("import { x } from '../analysis/analysis.service';")).toBe(true);
    expect(ANALYSIS_IMPORT.test("import { x } from '../../modules/analysis/analysis-output';")).toBe(true);
    expect(ANALYSIS_IMPORT.test("import { x } from '../valuation/valuation.service';")).toBe(false);
  });
});
