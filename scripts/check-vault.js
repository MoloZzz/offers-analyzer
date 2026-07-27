#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const vaultRoot = path.join(repositoryRoot, 'knowledge-offers-analyzer');
const requiredFrontmatter = ['title', 'type', 'updated'];

const errors = [];
const warnings = [];
const notePaths = new Set();
const noteNames = new Set();

for (const filePath of markdownFiles(vaultRoot)) {
  const relativePath = path.relative(vaultRoot, filePath).split(path.sep).join('/');
  notePaths.add(withoutExtension(relativePath).toLowerCase());
  noteNames.add(withoutExtension(path.basename(filePath)).toLowerCase());
}

for (const filePath of markdownFiles(vaultRoot)) {
  checkFrontmatter(filePath);
  checkWikiLinks(filePath);
}

report();

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

function checkFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const label = relativeToVault(filePath);

  if (!match) {
    errors.push(`${label}: missing YAML frontmatter at the start of the note`);
    return;
  }

  const keys = new Set(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):/))
      .filter(Boolean)
      .map((result) => result[1]),
  );

  for (const key of requiredFrontmatter) {
    if (!keys.has(key)) errors.push(`${label}: frontmatter is missing '${key}'`);
  }
}

function checkWikiLinks(filePath) {
  const label = relativeToVault(filePath);
  const content = stripCode(fs.readFileSync(filePath, 'utf8'));
  const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);

  for (const match of matches) {
    const rawLink = match[1];
    if (rawLink.includes('\\|')) {
      errors.push(`${label}: malformed wikilink '[[${rawLink}]]' uses '\\|' instead of '|' for its alias`);
      continue;
    }

    const target = rawLink.split('|', 1)[0].split('#', 1)[0].trim();
    if (!target || target.includes('\\')) {
      errors.push(`${label}: malformed wikilink '[[${rawLink}]]'`);
      continue;
    }

    const normalizedTarget = target.replace(/\\/g, '/').toLowerCase();
    if (!notePaths.has(normalizedTarget) && !noteNames.has(normalizedTarget)) {
      warnings.push(`${label}: unresolved wikilink '[[${target}]]' (future-note TODO is allowed)`);
    }
  }
}

function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '');
}

function withoutExtension(value) {
  return value.replace(/\.md$/i, '');
}

function relativeToVault(filePath) {
  return path.relative(vaultRoot, filePath).split(path.sep).join('/');
}

function report() {
  for (const warning of warnings) console.warn(`WARN ${warning}`);
  for (const error of errors) console.error(`ERROR ${error}`);

  if (errors.length > 0) {
    console.error(`Vault check failed: ${errors.length} error(s), ${warnings.length} warning(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Vault check passed: ${warnings.length} warning(s).`);
}
