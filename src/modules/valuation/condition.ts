/**
 * Condition signals parsed from the free-text seller description (AUTO.RIA `autoData.description`).
 * A car priced below market *because* it's wrecked or a non-runner is a trap, not a deal — these
 * signals feed the red-flags (see red-flags.ts). Pure + deterministic → unit-testable.
 *
 * Ukrainian and Russian phrasings both occur. Two matching modes:
 *  - **plain**: unambiguous problem phrases matched as-is (incl. ones that already contain «не»,
 *    like «не на ходу»);
 *  - **guarded**: "needs X" phrases that flip meaning under negation — «не потребує ремонту»,
 *    «вкладень не потребує», «після капремонту» — only fire when NOT preceded by не/без/після/после.
 */
export interface ConditionSignals {
  /** Wrecked / after a serious accident — disqualifying. */
  afterAccident: boolean;
  /** Non-runner / for parts / needs restoration — disqualifying. */
  notRunning: boolean;
  /** Needs repair or paint — soft penalty. */
  needsRepair: boolean;
  /** Mentioned engine/gearbox trouble — soft penalty. */
  mechanicalIssue: boolean;
}

const AFTER_ACCIDENT_PLAIN = ['після дтп', 'после дтп', 'аварійн', 'аварийн', 'розбит', 'разбит', 'тотал'];
const NOT_RUNNING_PLAIN = [
  'не на ходу',
  'на запчаст',
  'не заводит',
  'не заводить',
  'під відновлен',
  'под восстановлен',
];
const NEEDS_REPAIR_GUARDED = [
  'потребує ремонт',
  'требует ремонт',
  'потребує вкладен',
  'требует вложен',
  'требует покраск',
  'потребує фарбуванн',
];
const MECHANICAL_GUARDED = ['капремонт', 'капиталк', 'троїть', 'троит', 'стук'];

/** Preceding-negation / already-done markers that flip a "needs X" phrase to harmless. */
const NEGATION = /(^|[^а-яёіїєґ'])(не|без|після|после)\s*$/;

function mentionsPlain(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function mentionsGuarded(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    let from = 0;
    for (;;) {
      const i = text.indexOf(phrase, from);
      if (i < 0) return false;
      const before = text.slice(Math.max(0, i - 16), i);
      if (!NEGATION.test(before)) return true; // an un-negated occurrence
      from = i + phrase.length;
    }
  });
}

export function assessCondition(description?: string): ConditionSignals {
  const text = (description ?? '').toLowerCase();
  if (text.trim() === '') {
    return { afterAccident: false, notRunning: false, needsRepair: false, mechanicalIssue: false };
  }
  return {
    afterAccident: mentionsPlain(text, AFTER_ACCIDENT_PLAIN),
    notRunning: mentionsPlain(text, NOT_RUNNING_PLAIN),
    needsRepair: mentionsGuarded(text, NEEDS_REPAIR_GUARDED),
    mechanicalIssue: mentionsGuarded(text, MECHANICAL_GUARDED),
  };
}
