import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { normalizeConfig } from '../lib/config.mjs';
import { parseFrontmatter, validateRequiredMetadata } from '../lib/frontmatter.mjs';
import { build } from '../lib/render.mjs';
import { check, collectFindings } from '../lib/rules.mjs';
import { loadNotes } from '../lib/notes.mjs';
import { rank } from '../lib/search.mjs';

function note(title, type, body, extra = '') {
  return `---\ntitle: ${title}\ntype: ${type}\nupdated: 2026-08-02${extra}\n---\n\n${body}\n`;
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vault-engine-'));
  const vault = path.join(root, 'knowledge');
  mkdirSync(path.join(vault, 'context'), { recursive: true });
  writeFileSync(
    path.join(vault, '00-INDEX.md'),
    note('Index', 'moc', '# Index\n\n[[Decision]]\n[[Roadmap]]'),
  );
  writeFileSync(
    path.join(vault, 'Decision.md'),
    note('Decision', 'decision', '# Decision\n\n## API policy\n\nOfficial API only.'),
  );
  writeFileSync(
    path.join(vault, 'Roadmap.md'),
    note('Roadmap', 'roadmap', '# Roadmap\n\n- [ ] First step'),
  );
  writeFileSync(
    path.join(vault, 'context', 'private.md'),
    note(
      'Private session note',
      'context',
      '# Private\n\ncontext-only-search-token must never enter curated retrieval.',
    ),
  );
  writeFileSync(
    path.join(vault, 'context', 'CURRENT.md'),
    note('Current handoff', 'context', '# Current\n\nRead separately.'),
  );
  const config = normalizeConfig(
    {
      vaultDir: 'knowledge',
      codeRoot: '.',
      adapter: 'none',
      indexNote: '00-INDEX',
      roadmapNote: 'Roadmap',
      contextDir: 'context',
      currentContext: 'context/CURRENT.md',
    },
    root,
  );
  return { root, vault, config };
}

function tree(root, base = root, output = {}) {
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) tree(root, full, output);
    else output[path.relative(root, full).replace(/\\/g, '/')] = readFileSync(full, 'utf8');
  }
  return output;
}

test('frontmatter accepts current required metadata and optional engine metadata without dropping project fields', () => {
  const parsed = parseFrontmatter(
    '---\n' +
      'title: Existing title\n' +
      'type: decision\n' +
      'status: Accepted\n' +
      'updated: 2026-08-02\n' +
      'summary: A concise summary\n' +
      'code:\n' +
      '  - src/example.ts\n' +
      'rev: abcdef012345\n' +
      '---\n\n# Existing title\n',
  );

  assert.equal(parsed.data.title, 'Existing title');
  assert.equal(parsed.data.type, 'decision');
  assert.equal(parsed.data.updated, '2026-08-02');
  assert.equal(parsed.data.status, 'Accepted');
  assert.deepEqual(parsed.data.code, ['src/example.ts']);
  assert.equal(parsed.data.rev, 'abcdef012345');
  assert.deepEqual(validateRequiredMetadata(parsed), []);
});

test('curated discovery and retrieval exclude the configured context subtree', async (t) => {
  const { root, vault, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const notes = loadNotes(root, config);
  assert.deepEqual(
    notes.map((item) => item.rel),
    ['00-INDEX.md', 'Decision.md', 'Roadmap.md'],
  );
  assert.equal(rank(root, notes, 'context-only-search-token').length, 0);

  await build(root, config);
  const index = readFileSync(path.join(vault, '_gen', 'index.json'), 'utf8');
  const context = readFileSync(path.join(vault, '_gen', 'context.txt'), 'utf8');
  assert.doesNotMatch(index, /private\.md|Private session note/);
  assert.doesNotMatch(context, /context-only-search-token/);
  assert.match(context, /excluded from graph and search/);
  assert.match(context, /handoff\s+knowledge\/context\/CURRENT\.md/);
});

test('check is read-only after build', async (t) => {
  const { root, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await build(root, config);
  const before = tree(root);
  const result = await check(root, config, { silent: true });
  const after = tree(root);

  assert.equal(result, 0);
  assert.deepEqual(after, before);
});

test('stale generated output is advisory by default, strict when requested, and never rewritten by check', async (t) => {
  const { root, vault, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await build(root, config);
  writeFileSync(path.join(vault, '_gen', 'context.txt'), '# deliberately stale\n', 'utf8');
  const before = tree(root);
  const { findings } = await collectFindings(root, config);
  const normal = await check(root, config, { silent: true });
  const strict = await check(root, config, { strict: true, silent: true });
  const after = tree(root);

  assert.ok(findings.some((item) => item.rule === 'generated-stale'));
  assert.equal(normal, 0);
  assert.equal(strict, 1);
  assert.deepEqual(after, before);
});

test('a narrow revision pin warns until reviewed and never makes check mutate the owned source', async (t) => {
  const { root, vault, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'example.ts'), 'export const example = 1;\n', 'utf8');
  writeFileSync(
    path.join(vault, 'Decision.md'),
    note(
      'Decision',
      'decision',
      '# Decision\n\n## API policy\n\nOfficial API only.',
      '\nsummary: Owns one source pin\ncode:\n  - src/example.ts\nrev: aaaaaaaaaaaa',
    ),
  );
  await build(root, config);
  const before = tree(root);
  const { findings } = await collectFindings(root, config);
  const normal = await check(root, config, { silent: true });
  const strict = await check(root, config, { strict: true, silent: true });
  const after = tree(root);

  assert.ok(findings.some((item) => item.rule === 'rev-stale'));
  assert.equal(normal, 0);
  assert.equal(strict, 1);
  assert.deepEqual(after, before);
});

test('optional retrieval baselines are validated without making check a writer', async (t) => {
  const { root, vault, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(
    path.join(vault, '_retrieval.tsv'),
    '# query\texpected ref\tmode\nofficial API\tDecision\ttop\n',
  );
  await build(root, config);
  assert.equal(await check(root, config, { silent: true }), 0);

  writeFileSync(
    path.join(vault, '_retrieval.tsv'),
    '# query\texpected ref\tmode\nmissing phrase\tDecision\ttop\n',
  );
  const before = tree(root);
  const { findings } = await collectFindings(root, config);
  const after = tree(root);

  assert.ok(findings.some((item) => item.rule === 'retrieval-regression'));
  assert.deepEqual(after, before);
});

test('malformed wikilinks remain blocking and check leaves the failing fixture untouched', async (t) => {
  const { root, vault, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(
    path.join(vault, 'Decision.md'),
    note('Decision', 'decision', '# Decision\n\n[[Roadmap\\|bad alias]]'),
  );
  await build(root, config);
  const before = tree(root);
  const result = await check(root, config, { silent: true });
  const after = tree(root);

  assert.equal(result, 1);
  assert.deepEqual(after, before);
});
