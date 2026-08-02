/**
 * The null adapter: a project whose stack nothing here understands yet.
 *
 * Every function returns empty, and `renderContext` omits the sections that
 * come back empty — so such a project still gets notes, retrieval, the graph,
 * the check rules and the context governor, just without the auto-derived
 * CODE / ENV / CMDS blocks. That degradation is the point: the alternative is
 * that the whole vault refuses to run on anything but a NestJS repo.
 *
 * Returning empty is only ever correct because this adapter was CHOSEN. A named
 * adapter that cannot parse its own stack still hard-fails — see nest-typeorm.
 */
export function entities() {
  return [];
}

export function migrations() {
  return [];
}

export function providers() {
  return [];
}

export function envVars() {
  return { used: [], defaults: new Map(), missing: [] };
}

export function codeMap() {
  return [];
}

export function npmScripts() {
  return new Set();
}

/**
 * Structurally identical to a real adapter's return, just empty — `renderContext`
 * dereferences `unit.cases` / `int.files` without guarding, so returning null
 * here would trade a missing section for a TypeError.
 */
const emptySide = () => ({ cases: 0, files: 0, byDir: {}, skipped: 0, only: [] });

export function testCounts() {
  return { unit: emptySide(), int: emptySide(), hasEach: false, only: [] };
}
