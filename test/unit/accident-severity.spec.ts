import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assessAccidentSeverity,
  type AccidentSeverityLexicon,
} from '../../src/modules/valuation/accident-severity';
import { assessCondition } from '../../src/modules/valuation/condition';
import { ACCIDENT_CORPUS, toInput, type AccidentCase } from '../fixtures/accident-corpus';

/**
 * Loads the shipped lexicon rather than a hand-rolled test one — the config file is part of the
 * behaviour under test (a marker that is missing from it is a real defect, not a fixture gap).
 */
const LEXICON: AccidentSeverityLexicon = (() => {
  const path = join(process.cwd(), 'config', 'heuristics', 'accident-severity.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as AccidentSeverityLexicon;
  return {
    version: raw.version,
    severe: raw.severe.map((p) => p.toLowerCase()),
    moderate: raw.moderate.map((p) => p.toLowerCase()),
    cosmetic: raw.cosmetic.map((p) => p.toLowerCase()),
    disclosure: raw.disclosure.map((p) => p.toLowerCase()),
  };
})();

const classify = (input: Parameters<typeof assessAccidentSeverity>[0]) =>
  assessAccidentSeverity(input, LEXICON);

describe('assessAccidentSeverity (T003 — bar + description → graded severity)', () => {
  it('reaches severe on a structural marker and lists every matched marker as evidence', () => {
    const v = classify({ description: 'Після ДТП заміна стійки, все зроблено якісно' });
    expect(v?.bucket).toBe('severe');
    expect(v?.reason).toBe('structural-evidence');
    const markers = v?.evidence.map((e) => e.marker) ?? [];
    expect(markers).toContain('заміна стійк');
    expect(markers).toContain('після дтп'); // the disclosure is recorded too, not swallowed
    expect(v?.evidence.every((e) => e.source === 'text')).toBe(true);
  });

  it('fires severe from the description alone when the AUTO.RIA damage bar is clean', () => {
    const v = classify({
      description: 'Лонжерон правий замінено, бар чистий',
      damaged: false,
      salvage: false,
    });
    expect(v?.bucket).toBe('severe');
  });

  it('floors «після ДТП замінено бампер» at unknown without VIN evidence (FR-003)', () => {
    const v = classify({ description: 'Після ДТП замінено бампер, більше нічого' });
    expect(v?.bucket).toBe('unknown');
    expect(v?.corroborated).toBe(false);
    expect(v?.reason).toBe('uncorroborated-claim-floored');
    // the cosmetic evidence is still recorded — the floor changes the verdict, not the facts
    expect(v?.evidence.map((e) => e.marker)).toContain('замінено бампер');
  });

  it('admits cosmetic for the same description with VIN evidence (FR-003)', () => {
    expect(classify({ description: 'Після ДТП замінено бампер', vinChecked: true })).toMatchObject({
      bucket: 'cosmetic',
      corroborated: true,
      reason: 'corroborated-minor-claim',
    });
    expect(classify({ description: 'После ДТП бампер заменен', hasVinReport: true })).toMatchObject({
      bucket: 'cosmetic',
      corroborated: true,
    });
  });

  it('yields unknown with "severity not established" for a damage bar and an empty description', () => {
    const v = classify({ description: '', damaged: true });
    expect(v).toMatchObject({ bucket: 'unknown', reason: 'severity-not-established' });
    expect(v?.evidence).toEqual([{ marker: 'damaged', source: 'bar' }]);
    expect(classify({ damaged: true })?.bucket).toBe('unknown'); // description missing entirely
  });

  it('resolves a bar/description contradiction to unknown, recording both signals', () => {
    const v = classify({ description: 'Не бита, не крашена, все рідне', damaged: true });
    expect(v?.bucket).toBe('unknown');
    expect(v?.evidence).toEqual([{ marker: 'damaged', source: 'bar' }]);
    // a VIN check corroborates a claim; it does not turn a denial into a severity
    expect(classify({ description: 'Не була у ДТП', damaged: true, vinChecked: true })?.bucket).toBe(
      'unknown',
    );
  });

  it('fires nothing on negated phrasings (FR-010)', () => {
    expect(classify({ description: 'Не був у ДТП, один власник' })).toBeNull();
    expect(classify({ description: 'Без ДТП, без фарбування, все рідне' })).toBeNull();
    expect(classify({ description: 'Не бита, не крашена, вложений не требует' })).toBeNull();
    expect(classify({ description: 'Не аварийная, состояние отличное' })).toBeNull();
  });

  it('returns no verdict when nothing indicates an accident', () => {
    expect(classify({ description: 'Один власник, гаражне зберігання, все рідне' })).toBeNull();
    expect(classify({ description: '' })).toBeNull();
    expect(classify({})).toBeNull();
  });

  it('keeps salvage and severe terminal — no input path softens them (FR-002)', () => {
    expect(classify({ description: 'Тільки подряпини на бампері', salvage: true })?.bucket).toBe(
      'severe',
    );
    expect(
      classify({ description: 'Тільки подряпини', salvage: true, vinChecked: true })?.bucket,
    ).toBe('severe');
    expect(classify({ description: 'Заміна стійки, є звіт по VIN', vinChecked: true })?.bucket).toBe(
      'severe',
    );
  });
});

describe('anti-gaming properties over the full corpus (T005)', () => {
  /** Runs a corpus case and reports it as `note → bucket`, so a failure names the offending case. */
  const actual = (c: AccidentCase) => `${c.note} → ${classify(toInput(c))?.bucket ?? 'null'}`;
  const label = (c: AccidentCase) => `${c.note} → ${c.expected ?? 'null'}`;

  it('classifies every labelled corpus case as expected', () => {
    expect(ACCIDENT_CORPUS.map(actual)).toEqual(ACCIDENT_CORPUS.map(label));
  });

  it('SC-002: zero severe cases are classified below severe', () => {
    const severe = ACCIDENT_CORPUS.filter((c) => c.expected === 'severe');
    expect(severe.map(actual)).toEqual(severe.map(label));
    // guard against the corpus silently losing its severe stratum
    expect(ACCIDENT_CORPUS.filter((c) => c.expected === 'severe').length).toBeGreaterThanOrEqual(20);
  });

  it('SC-003: no description-only claim of minor damage reaches cosmetic without corroboration', () => {
    const claims = ACCIDENT_CORPUS.filter((c) => c.minorClaimFromTextOnly === true);
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims) {
      const v = classify({ ...toInput(c), vinChecked: false, hasVinReport: false });
      expect([c.note, v?.bucket]).not.toEqual([c.note, 'cosmetic']);
      expect([c.note, v?.corroborated]).toEqual([c.note, false]);
    }
  });

  it('a deep discount cannot reach cosmetic: the floor is not an input the caller can weigh', () => {
    // The classifier takes no price, discount, or penalty input at all — by construction there is
    // nothing for a discount to out-earn. This asserts the shape of the contract, not a number.
    const uncorroborated = classify({ description: 'Дрібне ДТП, тільки подряпини' });
    expect(uncorroborated?.bucket).toBe('unknown');
    expect(Object.keys(uncorroborated ?? {})).toEqual([
      'bucket',
      'evidence',
      'corroborated',
      'reason',
    ]);
  });
});

describe('condition.ts is unchanged by the new classifier (T006, FR-010)', () => {
  it('still returns its existing booleans for the phrasings spec 018 reclassifies', () => {
    // «після ДТП» remains an afterAccident boolean here even though the classifier now grades it —
    // the two modules answer different questions and phase 1 changes neither red-flags nor scoring.
    expect(assessCondition('Після ДТП замінено бампер').afterAccident).toBe(true);
    expect(assessCondition('Розбита аварійна машина').afterAccident).toBe(true);
    expect(assessCondition('Не бита, не крашена').afterAccident).toBe(false);
    expect(assessCondition(undefined)).toEqual({
      afterAccident: false,
      notRunning: false,
      needsRepair: false,
      mechanicalIssue: false,
    });
  });
});
