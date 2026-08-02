/** Build a deterministic graph from curated (never context) Markdown notes. */
import { cmp, sortBy } from './fs.mjs';

function key(value, locale = 'en') {
  return String(value).normalize('NFC').toLocaleLowerCase(locale);
}

function refKey(value) {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.md$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

function addIndex(index, value, note, locale) {
  const normalized = key(value, locale);
  const existing = index.get(normalized) || [];
  existing.push(note);
  index.set(normalized, existing);
}

/** Resolve vault-relative paths first, then only unambiguous basenames. */
export function resolveNoteReference(notes, reference, locale = 'en') {
  const wanted = refKey(reference);
  const byPath = new Map();
  const byName = new Map();
  for (const note of notes) {
    addIndex(byPath, refKey(note.rel), note, locale);
    addIndex(byName, note.name, note, locale);
  }
  const pathHits = byPath.get(key(wanted, locale)) || [];
  if (pathHits.length === 1)
    return { note: pathHits[0], caseMismatch: refKey(pathHits[0].rel) !== wanted };
  if (pathHits.length > 1) return { ambiguous: sortBy(pathHits, (note) => note.rel) };
  const nameHits = byName.get(key(wanted, locale)) || [];
  if (nameHits.length === 1)
    return { note: nameHits[0], caseMismatch: noteNameDiffers(nameHits[0].name, wanted) };
  if (nameHits.length > 1) return { ambiguous: sortBy(nameHits, (note) => note.rel) };
  return null;
}

function noteNameDiffers(actual, requested) {
  return actual.normalize('NFC') !== requested.normalize('NFC');
}

export function buildGraph(notes, config = {}) {
  const locale = config.locale || 'en';
  const edges = [];
  const dangling = [];
  const ambiguous = [];
  const caseMismatch = [];
  const inboundSources = new Map(notes.map((note) => [note.rel, new Set()]));
  const outbound = new Map(notes.map((note) => [note.rel, 0]));
  for (const from of notes) {
    for (const link of from.links) {
      const resolution = resolveNoteReference(notes, link.target, locale);
      if (!resolution) {
        dangling.push({ from: from.rel, target: link.target, line: link.line });
        continue;
      }
      if (resolution.ambiguous) {
        ambiguous.push({
          from: from.rel,
          target: link.target,
          line: link.line,
          candidates: resolution.ambiguous.map((note) => note.rel),
        });
        continue;
      }
      const to = resolution.note;
      edges.push({
        from: from.rel,
        to: to.rel,
        anchor: link.anchor,
        embed: link.embed,
        line: link.line,
      });
      outbound.set(from.rel, (outbound.get(from.rel) || 0) + 1);
      if (from.rel !== to.rel) inboundSources.get(to.rel)?.add(from.rel);
      if (resolution.caseMismatch)
        caseMismatch.push({ from: from.rel, target: link.target, actual: to.rel, line: link.line });
    }
  }
  const nodes = sortBy(
    notes.map((note) => ({
      rel: note.rel,
      name: note.name,
      title: note.title,
      type: note.type,
      inDeg: inboundSources.get(note.rel)?.size || 0,
      outDeg: outbound.get(note.rel) || 0,
    })),
    (node) => node.rel,
  );
  const adjacency = new Map(notes.map((note) => [note.rel, []]));
  for (const edge of edges) if (edge.from !== edge.to) adjacency.get(edge.from)?.push(edge.to);
  const configuredIndex = config.indexNote
    ? resolveNoteReference(notes, config.indexNote, locale)
    : null;
  const index = configuredIndex?.note || null;
  const reachable = new Set();
  if (index) {
    const queue = [index.rel];
    reachable.add(index.rel);
    for (let cursor = 0; cursor < queue.length; cursor++)
      for (const next of adjacency.get(queue[cursor]) || [])
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
  }
  const parent = new Map(notes.map((note) => [note.rel, note.rel]));
  const find = (item) => {
    let root = item;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(item) !== root) {
      const next = parent.get(item);
      parent.set(item, root);
      item = next;
    }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  for (const edge of edges) if (edge.from !== edge.to) union(edge.from, edge.to);
  const groups = new Map();
  for (const note of notes) {
    const root = find(note.rel);
    const group = groups.get(root) || [];
    group.push(note.rel);
    groups.set(root, group);
  }
  const sortFinding = (left, right) =>
    cmp(left.from, right.from) || cmp(left.target, right.target) || left.line - right.line;
  return {
    nodes,
    edges: [...edges].sort(
      (left, right) =>
        cmp(left.from, right.from) || cmp(left.to, right.to) || left.line - right.line,
    ),
    dangling: [...dangling].sort(sortFinding),
    ambiguous: [...ambiguous].sort(sortFinding),
    caseMismatch: [...caseMismatch].sort(sortFinding),
    components: sortBy(
      [...groups.values()].map((group) => sortBy(group)),
      (group) => group[0],
    ),
    orphans: sortBy(nodes.filter((node) => node.inDeg === 0).map((node) => node.rel)),
    unreachable: index
      ? sortBy(nodes.map((node) => node.rel).filter((rel) => !reachable.has(rel)))
      : [],
    index: index?.rel || null,
  };
}
