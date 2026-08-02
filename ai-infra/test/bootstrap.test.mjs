import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCli } from '../bin/ai-infra.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXED_NOW = new Date('2026-08-02T12:00:00.000Z');

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ai-infra-bootstrap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: (value) => stdout.push(String(value)),
    stderr: (value) => stderr.push(String(value)),
    text() {
      return { stdout: stdout.join(''), stderr: stderr.join('') };
    },
  };
}

function installArgs(target, mode) {
  return ['init', '--target', target, '--project-name', 'Neutral Project', mode];
}

function tree(root, directory = root, output = {}) {
  if (!existsSync(directory)) return output;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      tree(root, absolute, output);
    } else if (entry.isFile()) {
      output[relative] = readFileSync(absolute, 'utf8');
    }
  }
  return output;
}

async function invoke(argv, root, out = capture()) {
  const code = await runCli(argv, {
    kitRoot: KIT_ROOT,
    cwd: root,
    now: FIXED_NOW,
    stdout: out.stdout,
    stderr: out.stderr,
  });
  return { code, out: out.text() };
}

function runEngine(target, ...args) {
  const result = spawnSync(process.execPath, ['ai-infra/engine/v.mjs', ...args], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    'engine command failed:\n' + (result.stdout || '') + (result.stderr || ''),
  );
  return result;
}

function runInstalledCli(target, ...args) {
  const result = spawnSync(process.execPath, ['ai-infra/bin/ai-infra.mjs', ...args], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    'installed CLI command failed:\n' + (result.stdout || '') + (result.stderr || ''),
  );
  return result;
}

test('init defaults to a no-write dry run and accepts an explicit dry-run flag', async (t) => {
  const root = fixture(t);
  const target = path.join(root, 'new-project');

  const { code, out } = await invoke(
    ['init', '--target', target, '--project-name', 'Neutral Project'],
    root,
  );

  assert.equal(code, 0);
  assert.equal(existsSync(target), false);
  assert.match(out.stdout, /init: dry-run/);
  assert.match(out.stdout, /would create/);
  assert.match(out.stdout, /vault\.config\.json/);
  assert.match(out.stdout, /ai-infra\/engine\/v\.mjs/);
  assert.equal(out.stderr, '');

  const explicit = path.join(root, 'explicit-dry-run');
  const result = await invoke(
    ['init', '--target', explicit, '--project-name', 'Neutral Project', '--dry-run'],
    root,
  );
  assert.equal(result.code, 0, result.out.stderr);
  assert.equal(existsSync(explicit), false);
});

test('apply creates a clean docs-only installation that builds and strict-checks', async (t) => {
  const root = fixture(t);
  const target = path.join(root, 'new-project');
  const applied = await invoke(installArgs(target, '--apply'), root);

  assert.equal(applied.code, 0, applied.out.stderr);
  assert.equal(existsSync(path.join(target, 'vault.config.json')), true);
  assert.equal(existsSync(path.join(target, 'ai-infra', 'bin', 'ai-infra.mjs')), true);
  assert.equal(existsSync(path.join(target, 'ai-infra', 'engine', 'v.mjs')), true);
  assert.equal(existsSync(path.join(target, 'ai-infra', 'VERSION')), true);
  assert.equal(existsSync(path.join(target, 'ai-infra', 'manifest.json')), true);
  assert.equal(existsSync(path.join(target, 'knowledge-neutral-project', '00-INDEX.md')), true);
  assert.equal(existsSync(path.join(target, 'specs', 'spec.md')), true);
  assert.equal(existsSync(path.join(target, 'AGENTS.md')), false);

  const config = JSON.parse(readFileSync(path.join(target, 'vault.config.json'), 'utf8'));
  assert.equal(config.vaultDir, 'knowledge-neutral-project');
  assert.equal(config.adapter, 'none');

  const installed = tree(target);
  const corpus = Object.values(installed).join('\n');
  const renderedTemplateCorpus = Object.entries(installed)
    .filter(([relative]) => !relative.startsWith('ai-infra/'))
    .map(([, source]) => source)
    .join('\n');
  const forbiddenProjectTerms = new RegExp(
    [
      'Off' + 'ers Analyzer',
      'AUTO' + '\\.RIA',
      'Listing' + 'Source',
      'offers' + '-nest-typeorm',
      'Type' + 'ORM',
    ].join('|'),
    'i',
  );
  assert.doesNotMatch(corpus, forbiddenProjectTerms);
  assert.doesNotMatch(renderedTemplateCorpus, /\{\{[A-Z][A-Z0-9_]*\}\}/);

  runEngine(target, 'build');
  const beforeCheck = tree(target);
  runEngine(target, 'check', '--strict');
  assert.deepEqual(tree(target), beforeCheck);

  const doctor = runInstalledCli(target, 'doctor', '--target', '.');
  assert.match(doctor.stdout, /doctor: core installation is present/);
});

test('apply refuses every collision and leaves existing files unchanged', async (t) => {
  const root = fixture(t);
  const target = path.join(root, 'new-project');
  const first = await invoke(installArgs(target, '--apply'), root);
  assert.equal(first.code, 0, first.out.stderr);

  const before = tree(target);
  const second = await invoke(installArgs(target, '--apply'), root);

  assert.equal(second.code, 1);
  assert.match(second.out.stderr, /refusing to overwrite/);
  assert.deepEqual(tree(target), before);
});

test('doctor is read-only and reports a malformed installation', async (t) => {
  const root = fixture(t);
  const target = path.join(root, 'broken-project');
  const result = await invoke(['doctor', '--target', target], root);

  assert.equal(result.code, 1);
  assert.match(result.out.stdout, /doctor: failed/);
  assert.match(result.out.stdout, /target directory does not exist/);
  assert.equal(existsSync(target), false);
});

test('initializer rejects a target that overlaps the source kit', async () => {
  const out = capture();
  const code = await runCli(
    ['init', '--target', KIT_ROOT, '--project-name', 'Neutral Project', '--apply'],
    {
      kitRoot: KIT_ROOT,
      cwd: KIT_ROOT,
      now: FIXED_NOW,
      stdout: out.stdout,
      stderr: out.stderr,
    },
  );

  assert.equal(code, 1);
  assert.match(out.text().stderr, /may not be the kit directory/);
  assert.equal(statSync(KIT_ROOT).isDirectory(), true);
});
