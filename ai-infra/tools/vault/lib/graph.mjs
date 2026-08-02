/**
 * Link-graph index for the vault: degrees, connected components, orphans,
 * dangling links, case mismatches, and directed reachability from the index
 * note.
 *
 * These metrics are load-bearing (they detect an unreachable/orphaned note),
 * so resolution and counting rules must be exact:
 *
 *   - Obsidian resolves `[[Target]]` by basename, case-INsensitively. A link
 *     whose case does not match the real filename still resolves in
 *     Obsidian but breaks on a case-sensitive filesystem, so it is resolved
 *     AND reported separately (`caseMismatch`), never silently accepted.
 *   - `inDeg` counts DISTINCT SOURCE NOTES per target, not raw link
 *     occurrences, and excludes self-links.
 *   - `outDeg` is the raw outgoing edge count (no dedup).
 *   - `components` are undirected (every edge treated as bidirectional).
 *   - `unreachable` is directed BFS from the note named '00 — Index'.
 *
 * All comparisons are done on NFC-normalized strings; all output ordering
 * uses raw code-unit comparison (`cmp`/`sortBy` from ./fs.mjs), never
 * `localeCompare`, so the result is deterministic across machines.
 */
import { cmp, sortBy } from './fs.mjs';

const INDEX_NOTE_NAME = '00 — Index';

/**
 * Resolve a raw `[[link]]` target string against the set of known notes.
 *
 * @param {string} rawTarget - trimmed, NFC-normalized link target text
 * @param {Map<string, object>} byName - exact name -> note
 * @param {Map<string, object>} byNameLower - lowercased name -> note
 * @returns {{ note: object, caseMismatch: boolean } | null}
 */
function resolveTarget(rawTarget, byName, byNameLower) {
  const exact = byName.get(rawTarget);
  if (exact) return { note: exact, caseMismatch: false };

  const candidate = byNameLower.get(rawTarget.toLowerCase());
  if (candidate) return { note: candidate, caseMismatch: true };

  return null;
}

/**
 * Build the link-graph index from a list of parsed `Note` objects
 * (see tools/vault/lib/notes.mjs for the input shape).
 */
export function buildGraph(notes) {
  // --- name lookup tables --------------------------------------------
  const byName = new Map(); // exact NFC name -> note
  const byNameLower = new Map(); // lowercased NFC name -> note (first wins)

  for (const note of notes) {
    const name = note.name.normalize('NFC');
    if (!byName.has(name)) byName.set(name, note);
    const lower = name.toLowerCase();
    if (!byNameLower.has(lower)) byNameLower.set(lower, note);
  }

  // --- resolve every link ----------------------------------------------
  const edges = [];
  const dangling = [];
  const caseMismatch = [];
  const outDegRaw = new Map(); // name -> raw outgoing edge count
  const inSources = new Map(); // name -> Set<sourceName> (self-links excluded)

  for (const note of notes) {
    const fromName = note.name.normalize('NFC');

    for (const link of note.links ?? []) {
      const rawTarget = String(link.target).trim().normalize('NFC');
      const resolution = resolveTarget(rawTarget, byName, byNameLower);

      if (!resolution) {
        dangling.push({ from: fromName, target: rawTarget, line: link.line });
        continue;
      }

      const toName = resolution.note.name.normalize('NFC');

      if (resolution.caseMismatch) {
        caseMismatch.push({
          from: fromName,
          target: rawTarget,
          actual: toName,
          line: link.line,
        });
      }

      edges.push({
        from: fromName,
        to: toName,
        anchor: link.anchor,
        embed: link.embed,
        line: link.line,
      });

      outDegRaw.set(fromName, (outDegRaw.get(fromName) ?? 0) + 1);

      if (fromName !== toName) {
        let sources = inSources.get(toName);
        if (!sources) {
          sources = new Set();
          inSources.set(toName, sources);
        }
        sources.add(fromName);
      }
    }
  }

  // --- degrees (defined for every note, 0 default) ----------------------
  const inDeg = new Map();
  const outDeg = new Map();
  for (const note of notes) {
    const name = note.name.normalize('NFC');
    inDeg.set(name, inSources.get(name)?.size ?? 0);
    outDeg.set(name, outDegRaw.get(name) ?? 0);
  }

  // --- nodes --------------------------------------------------------------
  const nodes = sortBy(
    notes.map((note) => {
      const name = note.name.normalize('NFC');
      return {
        name,
        rel: note.rel,
        type: note.type,
        inDeg: inDeg.get(name) ?? 0,
        outDeg: outDeg.get(name) ?? 0,
      };
    }),
    (n) => n.name,
  );

  // --- sorted edge/dangling/caseMismatch lists ----------------------------
  const sortedEdges = [...edges].sort(
    (a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || a.line - b.line,
  );
  const sortedDangling = [...dangling].sort(
    (a, b) => cmp(a.from, b.from) || cmp(a.target, b.target) || a.line - b.line,
  );
  const sortedCaseMismatch = [...caseMismatch].sort(
    (a, b) => cmp(a.from, b.from) || cmp(a.target, b.target) || a.line - b.line,
  );

  // --- undirected connected components (union-find) -----------------------
  const parent = new Map();
  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(x) !== root) {
      const next = parent.get(x);
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const note of notes) {
    const name = note.name.normalize('NFC');
    parent.set(name, name);
  }
  for (const e of edges) {
    if (e.from !== e.to) union(e.from, e.to);
  }

  const groups = new Map();
  for (const note of notes) {
    const name = note.name.normalize('NFC');
    const root = find(name);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(name);
  }

  const components = sortBy(
    [...groups.values()].map((g) => sortBy(g)),
    (g) => g[0],
  );

  // --- orphans (inDeg === 0) ----------------------------------------------
  const orphans = sortBy(nodes.filter((n) => n.inDeg === 0).map((n) => n.name));

  // --- directed reachability from '00 — Index' -----------------------------
  const adjacency = new Map();
  for (const note of notes) adjacency.set(note.name.normalize('NFC'), []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    adjacency.get(e.from)?.push(e.to);
  }

  const startName = INDEX_NOTE_NAME.normalize('NFC');
  const visited = new Set();
  if (adjacency.has(startName)) {
    visited.add(startName);
    const queue = [startName];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  const unreachable = sortBy(nodes.map((n) => n.name).filter((name) => !visited.has(name)));

  return {
    nodes,
    edges: sortedEdges,
    dangling: sortedDangling,
    caseMismatch: sortedCaseMismatch,
    components,
    orphans,
    unreachable,
    inDeg,
    outDeg,
  };
}
