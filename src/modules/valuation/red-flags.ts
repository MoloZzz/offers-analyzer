import { SellerType } from '../sources/ports/listing-source.port';

/** Inputs the red-flag rules inspect. Pure data — keeps the rules unit-testable. */
export interface RedFlagInput {
  discountPct: number;
  sellerType: SellerType;
  hasVinReport: boolean;
}

export interface RedFlagRule {
  code: string;
  /** A disqualifying flag suppresses the opportunity entirely; otherwise it only annotates. */
  disqualifying: boolean;
  fired: (input: RedFlagInput) => boolean;
}

/**
 * v1 red-flags. "Cheaper than average" is often a scam/damaged car — see
 * knowledge-offers-analyzer/research/profitability-definition.md. Thresholds are conservative
 * and can move to config later.
 */
export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    code: 'suspicious_discount',
    disqualifying: true,
    // Too good to be true — likely scam or hidden damage.
    fired: (i) => i.discountPct > 45,
  },
  {
    code: 'no_vin_report',
    disqualifying: false,
    fired: (i) => !i.hasVinReport,
  },
];

export interface RedFlagOutcome {
  flags: Record<string, boolean>;
  disqualified: boolean;
}

export function evaluateRedFlags(input: RedFlagInput): RedFlagOutcome {
  const flags: Record<string, boolean> = {};
  let disqualified = false;
  for (const rule of RED_FLAG_RULES) {
    const fired = rule.fired(input);
    flags[rule.code] = fired;
    if (fired && rule.disqualifying) {
      disqualified = true;
    }
  }
  return { flags, disqualified };
}
