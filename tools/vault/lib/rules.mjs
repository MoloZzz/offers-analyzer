/**
 * Read-only consistency checks. This module never imports the build writer and
 * compares generated output in memory, so it is safe to run from hooks.
 */
import * as path from 'node:path';
import { collectCodeFacts } from './code.mjs';
import { validateRequiredMetadata } from './frontmatter.mjs';
import {
  digestFiles,
  expandPatterns,
  norm,
  readTextOrNull,
  resolveCodePattern,
  sortBy,
} from './fs.mjs';
import { buildGraph, resolveNoteReference } from './graph.mjs';
import { isContextPath, loadNotesWithErrors, stripFences } from './notes.mjs';
import { renderGenerated } from './render.mjs';
import { rank, RefError, resolveRef } from './search.mjs';

const SEVERITY = Object.freeze({
  'frontmatter-invalid': 'error',
  'malformed-wikilink': 'error',
  'generated-stale': 'warn',
  'configured-index-missing': 'warn',
  'configured-roadmap-missing': 'warn',
  'link-dangling': 'warn',
  'link-ambiguous': 'warn',
  'link-case': 'warn',
  'note-orphan': 'warn',
  'note-unreachable': 'warn',
  'entity-table-drift': 'error',
  'test-only': 'error',
  'env-undocumented': 'warn',
  'context-misplaced': 'warn',
  'spec-misplaced': 'warn',
  'status-owner-duplicate': 'warn',
  'fact-registry-invalid': 'warn',
  'fact-restated': 'warn',
  'rev-stale': 'warn',
  'retrieval-baseline-invalid': 'warn',
  'retrieval-regression': 'warn',
});

function finding(rule, where, message) {
  return { rule, where, message, severity: SEVERITY[rule] || 'info' };
}

function malformedLinks(note) {
  const output = [];
  const lines = stripFences(note.lines.join('\n')).split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (/\[\[[^\]]*\\\|[^\]]*\]\]/.test(lines[index])) {
      output.push(
        finding(
          'malformed-wikilink',
          `${note.rel}:${index + 1}`,
          "uses '\\|' for a wikilink alias; use '|'",
        ),
      );
    }
  }
  return output;
}

function outputText(value) {
  return norm(value).replace(/\n*$/, '\n');
}

/**
 * Optional committed regression cases: query<TAB>expected ref<TAB>top|within.
 * The file is deliberately outside the graph and is read only by validation;
 * it can be added after the corpus has a trustworthy baseline without forcing
 * every bootstrap project to invent one.
 */
function retrievalFindings(root, config, notes) {
  const source = readTextOrNull(path.resolve(root, config.vaultDir, '_retrieval.tsv'));
  if (source === null) return [];
  const findings = [];
  for (const [index, raw] of source.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [query, expected, rawMode = 'top'] = raw.split('\t').map((field) => field.trim());
    const where = `${config.vaultDir}/_retrieval.tsv:${index + 1}`;
    const mode = rawMode || 'top';
    if (!query || !expected || !['top', 'within'].includes(mode)) {
      findings.push(
        finding('retrieval-baseline-invalid', where, 'expected query<TAB>reference<TAB>top|within'),
      );
      continue;
    }
    let wanted;
    try {
      wanted = resolveRef(notes, expected);
    } catch (error) {
      const reason = error instanceof RefError ? error.message : String(error.message || error);
      findings.push(
        finding(
          'retrieval-baseline-invalid',
          where,
          `expected reference '${expected}' does not resolve: ${reason}`,
        ),
      );
      continue;
    }
    const hits = rank(root, notes, query, 8);
    const at = hits.findIndex(
      (hit) =>
        hit.note.rel === wanted.note.rel &&
        (wanted.headingIndex === null || hit.headingIndex === wanted.headingIndex),
    );
    const first = hits[0]
      ? hits[0].headingIndex === null
        ? hits[0].note.rel
        : `${hits[0].note.rel}#${hits[0].note.headings[hits[0].headingIndex].text}`
      : '(no results)';
    if (at === -1) {
      findings.push(
        finding(
          'retrieval-regression',
          where,
          `expected '${expected}' is absent from top 8 for '${query}'; #1 is ${first}`,
        ),
      );
    } else if (mode === 'top' && at !== 0) {
      findings.push(
        finding(
          'retrieval-regression',
          where,
          `expected '${expected}' is #${at + 1} for '${query}'; #1 is ${first}`,
        ),
      );
    }
  }
  return findings;
}

function sourceFactsFindings(ctx) {
  const findings = [];
  const entityTables = sortBy((ctx.entities || []).map((entity) => entity.table).filter(Boolean));
  const migrationTables = sortBy([
    ...new Set((ctx.migrations || []).flatMap((migration) => migration.tables || [])),
  ]);
  for (const table of entityTables) {
    if (!migrationTables.includes(table)) {
      findings.push(
        finding(
          'entity-table-drift',
          table,
          `@Entity('${table}') has no CREATE TABLE in the configured migration history`,
        ),
      );
    }
  }
  for (const table of migrationTables) {
    if (!entityTables.includes(table)) {
      findings.push(
        finding(
          'entity-table-drift',
          table,
          `a configured migration creates '${table}', but no selected entity maps to it`,
        ),
      );
    }
  }
  for (const variable of ctx.env?.missing || []) {
    findings.push(
      finding(
        'env-undocumented',
        variable,
        `used by application code but absent from .env.example; document it or remove the use`,
      ),
    );
  }
  for (const location of ctx.tests?.only || []) {
    findings.push(
      finding('test-only', location, 'focused test committed; remove .only/fit/ftest before merge'),
    );
  }
  return findings;
}

function contextPlacementFindings(allNotes, curated, config) {
  const findings = [];
  const roadmap = resolveNoteReference(curated, config.roadmapNote)?.note;
  for (const note of allNotes) {
    const isContext = isContextPath(note.path, config);
    const isContextType = note.type === 'context' || note.type === 'context-log';
    if (isContext && !isContextType) {
      findings.push(
        finding(
          'context-misplaced',
          note.rel,
          `belongs in ${config.contextDir}/ but has type '${note.type || '(missing)'}'; use context or context-log`,
        ),
      );
    }
    if (!isContext && isContextType) {
      findings.push(
        finding(
          'context-misplaced',
          note.rel,
          `has context-only type '${note.type}' outside ${config.contextDir}/; move it or promote it`,
        ),
      );
    }
    if (note.type === 'roadmap' && roadmap && note.rel !== roadmap.rel) {
      findings.push(
        finding(
          'status-owner-duplicate',
          note.rel,
          `competes with configured status owner '${roadmap.rel}'; link to it instead of creating another roadmap`,
        ),
      );
    }
  }
  return findings;
}

/**
 * Spec notes belong in one place. Without this, a `type: spec` note authored at
 * the vault root passes every other check: links resolve by basename, so nothing
 * dangles, and no rule owns note placement outside the context zone. That gap let
 * four spec notes sit beside the index for weeks. Placement is checkable, so it is
 * checked rather than left to discipline.
 */
function specPlacementFindings(allNotes, config) {
  const findings = [];
  const specs = config.specsDir;
  for (const note of allNotes) {
    if (note.type !== 'spec') continue;
    if (note.rel === specs || note.rel.startsWith(`${specs}/`)) continue;
    findings.push(
      finding(
        'spec-misplaced',
        note.rel,
        `has type 'spec' but sits outside ${specs}/; move it so spec notes stay in one place`,
      ),
    );
  }
  return findings;
}

function sectionLinksToOwner(lines, at, owner, notes) {
  let start = at;
  while (start > 0 && lines[start - 1].trim() && !/^#{1,6}\s/.test(lines[start - 1])) start--;
  let end = at + 1;
  while (end < lines.length && lines[end].trim() && !/^#{1,6}\s/.test(lines[end])) end++;
  for (const line of lines.slice(start, end)) {
    for (const match of line.matchAll(/\[\[([^\]|#]+)/g)) {
      if (resolveNoteReference(notes, match[1].trim())?.note?.rel === owner.rel) return true;
    }
  }
  return false;
}

/**
 * Optional, small registry for facts which must have a single canonical owner.
 * Each non-comment row is key<TAB>owner-note<TAB>restatement-regex.  A repeat
 * is allowed only when the same logical Markdown block links to its owner.
 */
function canonicalFactFindings(root, config, notes) {
  const source = readTextOrNull(path.resolve(root, config.vaultDir, '_facts.tsv'));
  if (source === null) return [];
  const findings = [];
  for (const [index, raw] of source.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ownerRef, expression] = raw.split('\t').map((field) => field.trim());
    const where = `${config.vaultDir}/_facts.tsv:${index + 1}`;
    if (!key || !ownerRef || !expression) {
      findings.push(
        finding(
          'fact-registry-invalid',
          where,
          'expected key<TAB>owner-note<TAB>restatement-regex',
        ),
      );
      continue;
    }
    const owner = resolveNoteReference(notes, ownerRef.split('#')[0])?.note;
    if (!owner) {
      findings.push(
        finding(
          'fact-registry-invalid',
          where,
          `owner '${ownerRef}' does not resolve in curated notes`,
        ),
      );
      continue;
    }
    let regex;
    try {
      regex = new RegExp(expression, 'iu');
    } catch (error) {
      findings.push(
        finding('fact-registry-invalid', where, `invalid restatement regex: ${error.message}`),
      );
      continue;
    }
    for (const note of notes) {
      if (note.rel === owner.rel) continue;
      const lines = stripFences(note.lines.join('\n')).split('\n');
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (!regex.test(lines[lineIndex])) continue;
        if (!sectionLinksToOwner(lines, lineIndex, owner, notes)) {
          findings.push(
            finding(
              'fact-restated',
              `${note.rel}:${lineIndex + 1}`,
              `'${key}' is owned by ${owner.rel}; replace the restatement with a link or keep the link in this block`,
            ),
          );
        }
      }
    }
  }
  return findings;
}

export async function collectFindings(root, config) {
  // Context is deliberately checked for basic frontmatter hygiene, but it is
  // removed before graph/retrieval artifacts are derived.
  const all = loadNotesWithErrors(root, config, { includeContext: true });
  const curated = all.notes.filter((note) => !isContextPath(note.path, config));
  const graph = buildGraph(curated, config);
  const code = await collectCodeFacts(root, config);
  const ctx = { root, config, notes: curated, graph, ...code };
  const findings = [];

  for (const error of all.errors)
    findings.push(finding('frontmatter-invalid', error.path, error.message));
  for (const note of all.notes) {
    for (const message of validateRequiredMetadata({
      hasFrontmatter: note.hasFrontmatter,
      data: note.data,
    })) {
      findings.push(finding('frontmatter-invalid', note.rel, message));
    }
    findings.push(...malformedLinks(note));
  }

  const index = resolveNoteReference(curated, config.indexNote);
  if (!index?.note) {
    findings.push(
      finding(
        'configured-index-missing',
        config.indexNote,
        `configured index note '${config.indexNote}' does not resolve in curated notes`,
      ),
    );
  }
  const roadmap = resolveNoteReference(curated, config.roadmapNote);
  if (!roadmap?.note) {
    findings.push(
      finding(
        'configured-roadmap-missing',
        config.roadmapNote,
        `configured roadmap note '${config.roadmapNote}' does not resolve in curated notes`,
      ),
    );
  }

  for (const item of graph.dangling) {
    findings.push(
      finding(
        'link-dangling',
        `${item.from}:${item.line}`,
        `[[${item.target}]] does not resolve in curated notes`,
      ),
    );
  }
  for (const item of graph.ambiguous) {
    findings.push(
      finding(
        'link-ambiguous',
        `${item.from}:${item.line}`,
        `[[${item.target}]] matches multiple notes: ${item.candidates.join(', ')}`,
      ),
    );
  }
  for (const item of graph.caseMismatch) {
    findings.push(
      finding(
        'link-case',
        `${item.from}:${item.line}`,
        `[[${item.target}]] differs in case from '${item.actual}'`,
      ),
    );
  }
  for (const rel of graph.orphans) {
    if (rel !== graph.index)
      findings.push(finding('note-orphan', rel, 'nothing links to this curated note'));
  }
  for (const rel of graph.unreachable) {
    findings.push(
      finding('note-unreachable', rel, `not reachable from configured index '${config.indexNote}'`),
    );
  }

  for (const note of curated) {
    if (!note.data.code?.length || !note.data.rev) continue;
    const files = expandPatterns(
      root,
      note.data.code.map((pattern) => resolveCodePattern(config, pattern)),
    );
    const actual = digestFiles(root, files);
    if (actual !== note.data.rev) {
      findings.push(
        finding(
          'rev-stale',
          note.rel,
          `code it describes changed (rev ${note.data.rev} -> ${actual}); review the note and update its rev pin`,
        ),
      );
    }
  }

  findings.push(...sourceFactsFindings(ctx));
  findings.push(...contextPlacementFindings(all.notes, curated, config));
  findings.push(...specPlacementFindings(all.notes, config));
  findings.push(...canonicalFactFindings(root, config, curated));
  findings.push(...retrievalFindings(root, config, curated));

  // Compare in memory. There is intentionally no call to build() here.
  for (const [name, expected] of Object.entries(renderGenerated(ctx))) {
    const rel = `${config.vaultDir}/_gen/${name}`;
    const actual = readTextOrNull(path.resolve(root, rel));
    if (actual === null) {
      findings.push(finding('generated-stale', rel, 'missing — run: vault build'));
    } else if (outputText(actual) !== outputText(expected)) {
      findings.push(finding('generated-stale', rel, 'stale — run: vault build'));
    }
  }

  return {
    findings: sortBy(findings, (item) => `${item.severity}:${item.rule}:${item.where}`),
    ctx,
  };
}

function report(findings, flags) {
  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warn');
  if (!flags.silent) {
    for (const severity of ['error', 'warn', 'info']) {
      const items = findings.filter((item) => item.severity === severity);
      if (!items.length) continue;
      process.stderr.write(`--- ${severity} (${items.length})\n`);
      for (const item of items)
        process.stderr.write(`  [${item.rule}] ${item.where}: ${item.message}\n`);
    }
    process.stderr.write(
      `vault check: ${errors.length} error(s), ${warnings.length} warning(s)${flags.strict ? ' [strict]' : ''}\n`,
    );
  }
  return errors.length || (flags.strict && warnings.length) ? 1 : 0;
}

/** Validate without modifying any file. */
export async function check(root, config, flags = {}) {
  const { findings } = await collectFindings(root, config);
  const filtered = flags.rule ? findings.filter((item) => item.rule === flags.rule) : findings;
  return report(filtered, flags);
}
