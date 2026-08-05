import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildDetailsCallback,
  parseDetailsCallback,
  splitIntoMessages,
  TELEGRAM_MESSAGE_LIMIT,
} from '../../src/modules/notifications/telegram/details-callback';

const LISTING_ID = '6f2b1f7a-6a1e-4f4e-9c53-3b3f0a2f9a11';

describe('details callback data', () => {
  it('round-trips the listing id', () => {
    expect(parseDetailsCallback(buildDetailsCallback(LISTING_ID))).toBe(LISTING_ID);
  });

  it('stays inside Telegram’s 64-byte callback_data limit', () => {
    expect(Buffer.byteLength(buildDetailsCallback(LISTING_ID), 'utf8')).toBeLessThanOrEqual(64);
  });

  it('ignores callback data belonging to the outcome and deal buttons', () => {
    expect(parseDetailsCallback('oc:good:abc')).toBeNull();
    expect(parseDetailsCallback('dl:bought:abc')).toBeNull();
    expect(parseDetailsCallback('')).toBeNull();
  });

  /**
   * The structural half of SC-002: the module the callback resolves through cannot reach a source,
   * because it does not import one. A future edit that adds the dependency has to touch this file.
   */
  it('has no source dependency to reach for', () => {
    // Comments are stripped first: this asserts what the module can *reach*, not what it talks
    // about — the doc comment above `DETAILS_PREFIX` names the very dependency being excluded.
    const code = readFileSync(
      join(__dirname, '../../src/modules/notifications/telegram/details-callback.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toContain('import');
    expect(code).not.toContain('LISTING_SOURCE');
    expect(code).not.toContain('@Injectable');
  });
});

describe('splitIntoMessages (FR-007)', () => {
  const section = (title: string, size: number) =>
    [title, ...Array.from({ length: size }, (_, i) => `${title} рядок ${i}`)].join('\n');

  it('keeps a breakdown that fits in one unmarked message', () => {
    const parts = splitIntoMessages([section('A', 3), section('B', 3)]);

    expect(parts).toHaveLength(1);
    expect(parts[0]).not.toContain('Деталі (');
  });

  it('splits at section boundaries and numbers the parts', () => {
    const sections = [section('A', 40), section('B', 40), section('C', 40)];

    const parts = splitIntoMessages(sections, 700);

    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part, i) => expect(part.startsWith(`Деталі (${i + 1}/${parts.length})`)).toBe(true));
    // No section header may appear in two different parts — that is what "never mid-section" means.
    for (const title of ['A', 'B', 'C']) {
      expect(parts.filter((p) => p.includes(`${title} рядок 0`))).toHaveLength(1);
      expect(parts.filter((p) => p.includes(`${title} рядок 39`))).toHaveLength(1);
      expect(parts.findIndex((p) => p.includes(`${title} рядок 0`))).toBe(
        parts.findIndex((p) => p.includes(`${title} рядок 39`)),
      );
    }
  });

  it('never emits a part over the platform limit', () => {
    const parts = splitIntoMessages(
      Array.from({ length: 12 }, (_, i) => section(`S${i}`, 60)),
      TELEGRAM_MESSAGE_LIMIT,
    );

    for (const part of parts) expect(part.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
  });

  it('falls back to line boundaries only for a section too large to fit alone', () => {
    const huge = section('H', 200);

    const parts = splitIntoMessages([huge], 400);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(400);
    // Content is split, never dropped.
    expect(parts.join('\n')).toContain('H рядок 199');
  });
});
