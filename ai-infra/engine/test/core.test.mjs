import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { normalizeConfig } from '../lib/config.mjs';
import { collectCapabilities } from '../lib/code.mjs';
import { build } from '../lib/render.mjs';
import { loadNotes } from '../lib/notes.mjs';
import { check } from '../lib/rules.mjs';
import { rank } from '../lib/search.mjs';

function note(title, type, body, extra = '') {
  return `---\ntitle: ${title}\ntype: ${type}\nupdated: 2026-08-02${extra}\n---\n\n${body}\n`;
}

function tree(root, base = root, output = {}) {
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) tree(root, full, output);
    else output[path.relative(root, full).replace(/\\/g, '/')] = readFileSync(full, 'utf8');
  }
  return output;
}

function fixture({ adapter = 'none' } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'portable-vault-'));
  const vault = path.join(root, 'knowledge');
  mkdirSync(path.join(vault, 'context', 'log'), { recursive: true });
  writeFileSync(
    path.join(vault, '00-INDEX.md'),
    note('Index', 'moc', '# Index\n\n[[Vision]]\n[[Roadmap]]'),
  );
  writeFileSync(
    path.join(vault, 'Vision.md'),
    note('Vision', 'business', '# Vision\n\n## Intent\n\nA neutral product intent. [[Decision]]'),
  );
  writeFileSync(
    path.join(vault, 'Decision.md'),
    note('Decision', 'decision', '# Decision\n\n## Boundary\n\nA durable trade-off.'),
  );
  writeFileSync(
    path.join(vault, 'Roadmap.md'),
    note('Roadmap', 'roadmap', '# Roadmap\n\n- [ ] First bounded outcome'),
  );
  writeFileSync(
    path.join(vault, 'context', 'CURRENT.md'),
    note('Current handoff', 'context', '# Current\n\nShort-lived work handoff.'),
  );
  writeFileSync(
    path.join(vault, 'context', 'log', '2026-08-02-bootstrap.md'),
    note('Bootstrap log', 'context-log', '# Log\n\nHistorical context only.'),
  );
  const config = normalizeConfig(
    {
      vaultDir: 'knowledge',
      adapter,
      indexNote: '00-INDEX',
      roadmapNote: 'Roadmap',
      contextDir: 'context',
      currentContext: 'context/CURRENT.md',
      qualityCommands: [{ label: 'test', command: 'any-test-command' }],
    },
    root,
  );
  return { root, vault, config };
}

test('docs-only none adapter builds and strictly validates without source claims', async (t) => {
  const { root, vault, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await build(root, config);
  assert.equal(await check(root, config, { strict: true, silent: true }), 0);
  assert.equal(rank(root, config, loadNotes(root, config), 'historical context only').length, 0);
  const facts = readFileSync(path.join(vault, '_gen', 'facts.txt'), 'utf8');
  const context = readFileSync(path.join(vault, '_gen', 'context.txt'), 'utf8');
  assert.match(facts, /No source facts/);
  assert.doesNotMatch(context, /SOURCE FACTS/);
  assert.match(context, /any-test-command/);
});

test('check is write-free after a build', async (t) => {
  const { root, config } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await build(root, config);
  const before = tree(root);
  assert.equal(await check(root, config, { strict: true, silent: true }), 0);
  assert.deepEqual(tree(root), before);
});

test('an optional adapter can expose generic facts without a framework schema', async (t) => {
  const { root, vault } = fixture({ adapter: './project-adapter.mjs' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, 'project-adapter.mjs'),
    `export const capabilities = { sourceFacts: true, codeMap: true };\nexport function sourceFacts() { return { sections: [{ title: 'RUNTIME', rows: ['language\\tExample'] }] }; }\nexport function codeMap() { return [{ scope: 'app', file: 'entry.txt', symbols: [{ kind: 'entry', name: 'main' }] }]; }\n`,
  );
  const config = normalizeConfig(
    {
      vaultDir: 'knowledge',
      adapter: './project-adapter.mjs',
      indexNote: '00-INDEX',
      roadmapNote: 'Roadmap',
      contextDir: 'context',
    },
    root,
  );
  const facts = await collectCapabilities(root, config);
  assert.deepEqual(facts.sourceFacts, [{ title: 'RUNTIME', rows: ['language\tExample'] }]);
  await build(root, config);
  assert.match(readFileSync(path.join(vault, '_gen', 'facts.txt'), 'utf8'), /RUNTIME/);
  assert.equal(await check(root, config, { strict: true, silent: true }), 0);
});
