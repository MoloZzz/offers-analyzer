/**
 * Null code adapter. Selecting it is intentional: the vault engine still
 * provides curated-note retrieval and graph checks while a project-specific
 * adapter is being designed, without inventing facts about the codebase.
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
  return { used: [], documented: [], defaults: new Map(), missing: [] };
}

export function codeMap() {
  return [];
}

export function npmScripts() {
  return new Map();
}

export function testCounts() {
  const empty = { cases: 0, files: 0, byDir: {} };
  return { unit: empty, int: empty, hasEach: false, only: [], skipped: 0 };
}
