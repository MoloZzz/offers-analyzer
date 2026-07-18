import { SellerType } from '../sources/ports/listing-source.port';

/** Inputs the red-flag rules inspect. Pure data — keeps the rules unit-testable. */
export interface RedFlagInput {
  discountPct: number;
  sellerType: SellerType;
  hasVinReport: boolean;
  damaged?: boolean;
  salvage?: boolean;
  unclearCustoms?: boolean;
  confiscated?: boolean;
  underCredit?: boolean;
  abroad?: boolean;
  // Condition signals parsed from the seller description (see condition.ts).
  afterAccident?: boolean;
  notRunning?: boolean;
  needsRepair?: boolean;
  mechanicalIssue?: boolean;
}

interface RedFlagRule {
  code: string;
  /** A disqualifying flag suppresses the opportunity entirely; a soft one only penalizes the score. */
  disqualifying: boolean;
  fired: (input: RedFlagInput) => boolean;
}

/**
 * v1 red-flags. "Cheaper than average" is often a scam/damaged car — see
 * knowledge-offers-analyzer/research/profitability-definition.md. Damage/salvage/customs signals
 * come straight from AUTO.RIA `autoInfoBar`.
 */
const RED_FLAG_RULES: RedFlagRule[] = [
  { code: 'suspicious_discount', disqualifying: true, fired: (i) => i.discountPct > 45 },
  { code: 'damaged', disqualifying: true, fired: (i) => i.damaged === true },
  { code: 'salvage', disqualifying: true, fired: (i) => i.salvage === true },
  { code: 'confiscated', disqualifying: true, fired: (i) => i.confiscated === true },
  { code: 'under_credit', disqualifying: true, fired: (i) => i.underCredit === true },
  { code: 'unclear_customs', disqualifying: false, fired: (i) => i.unclearCustoms === true },
  { code: 'abroad', disqualifying: false, fired: (i) => i.abroad === true },
  { code: 'no_vin_report', disqualifying: false, fired: (i) => !i.hasVinReport },
  // Condition read from the description — a cheap wreck/non-runner is a trap, not a deal.
  { code: 'desc_after_accident', disqualifying: true, fired: (i) => i.afterAccident === true },
  { code: 'desc_not_running', disqualifying: true, fired: (i) => i.notRunning === true },
  { code: 'desc_needs_repair', disqualifying: false, fired: (i) => i.needsRepair === true },
  { code: 'desc_mechanical_issue', disqualifying: false, fired: (i) => i.mechanicalIssue === true },
];

/** Codes of the non-disqualifying (soft) red-flags — used by weight learning (spec 002, E4). */
export const SOFT_FLAG_CODES: Set<string> = new Set(
  RED_FLAG_RULES.filter((r) => !r.disqualifying).map((r) => r.code),
);

/** Multiplier applied per soft (non-disqualifying) red-flag that fires. */
const SOFT_FLAG_PENALTY = 0.8;

export interface RedFlagOutcome {
  flags: Record<string, boolean>;
  disqualified: boolean;
  /** Score multiplier from soft flags (1 = none fired). */
  penalty: number;
}

export function evaluateRedFlags(
  input: RedFlagInput,
  softFlagPenalty: number = SOFT_FLAG_PENALTY,
): RedFlagOutcome {
  const flags: Record<string, boolean> = {};
  let disqualified = false;
  let softFired = 0;
  for (const rule of RED_FLAG_RULES) {
    const fired = rule.fired(input);
    flags[rule.code] = fired;
    if (fired) {
      if (rule.disqualifying) disqualified = true;
      else softFired += 1;
    }
  }
  return { flags, disqualified, penalty: Math.pow(softFlagPenalty, softFired) };
}
