/**
 * Repair-risk factor (spec 003 US2). Expected repair cost heuristic: DSG/CVT/air-susp/turbo-diesel/aged
 * premium diesels/hybrid battery age → HIGH; Corolla/Camry/CR-V/Mazda 6 → LOW. Classification lives
 * in versioned `repair-risk.json`; magnitude (bounds) is the ParameterSet bound, so it's tunable/rollbackable.
 * Pure + deterministic.
 */
import { FactorBound, FactorScore, toSubScore100 } from './factor';
import { RepairRiskTable, RepairRiskTier } from './tables';

export interface RepairRiskInput {
  make?: string;
  model?: string;
  gearbox?: string;
  fuel?: string;
  engine?: string;
  year?: number;
}

const TIER_REASON: Record<RepairRiskTier, string> = {
  LOW: 'надійна модель — низький ризик дорогої ремонтності',
  MEDIUM: 'середній ризик ремонтності',
  HIGH: 'високий риск коштовного ремонту — патерн виявлено',
};

/**
 * Returns the repair-risk contribution, or `null` when the factor is off (no ParameterSet bounds or no
 * table) or the listing lacks make/model. An assessable-but-unlisted model yields a neutral modifier
 * with reason "ризик ремонтності невідомий" — never a fabricated tier (US2 acceptance #2).
 */
export function repairRiskFactor(
  input: RepairRiskInput,
  table?: RepairRiskTable,
  bounds?: FactorBound,
): FactorScore | null {
  if (!bounds || !table) return null; // gated off via the active ParameterSet / missing table
  const make = input.make?.trim().toLowerCase();
  const model = input.model?.trim().toLowerCase();
  if (!make || !model) return null; // no data → neutral (omitted)

  // 1) Explicit model tier
  const modelTier = table.models[`${make}|${model}`];
  if (modelTier) {
    return buildResult(modelTier, bounds, TIER_REASON[modelTier]);
  }

  // 2) Explicit make tier
  const makeTier = table.makes[make];
  if (makeTier) {
    return buildResult(makeTier, bounds, TIER_REASON[makeTier]);
  }

  // 3) Pattern matching (gearbox/engine/fuel/age) — prefer HIGH > MEDIUM > LOW
  const currentYear = new Date().getFullYear();
  const age = input.year ? currentYear - input.year : undefined;

  let bestTier: RepairRiskTier | null = null;
  let bestReason = '';
  for (const pattern of table.patterns) {
    if (!matchesPattern(pattern, input, age)) continue;
    // Prefer HIGH > MEDIUM > LOW
    if (
      pattern.tier === 'HIGH' ||
      (pattern.tier === 'MEDIUM' && bestTier !== 'HIGH') ||
      (pattern.tier === 'LOW' && !bestTier)
    ) {
      bestTier = pattern.tier;
      bestReason = pattern.reason;
    }
  }

  if (bestTier) {
    return buildResult(bestTier, bounds, bestReason);
  }

  // 4) Unknown → neutral with reason
  return { factor: 'repair-risk', modifier: 1, subScore100: toSubScore100(1), reasons: ['ризик ремонтності невідомий'] };
}

function matchesPattern(
  pattern: { tier: RepairRiskTier; gearbox?: string[]; engine?: string[]; fuel?: string[]; minAge?: number; maxAge?: number },
  input: RepairRiskInput,
  age: number | undefined,
): boolean {
  if (pattern.gearbox) {
    if (!input.gearbox) return false;
    const gb = input.gearbox.toLowerCase();
    if (!pattern.gearbox.some((k) => gb.includes(k.toLowerCase()))) return false;
  }
  if (pattern.engine) {
    if (!input.engine) return false;
    const eng = input.engine.toLowerCase();
    if (!pattern.engine.some((k) => eng.includes(k.toLowerCase()))) return false;
  }
  if (pattern.fuel) {
    if (!input.fuel) return false;
    const fl = input.fuel.toLowerCase();
    if (!pattern.fuel.some((k) => fl.includes(k.toLowerCase()))) return false;
  }
  if (pattern.minAge != null && (age === undefined || age < pattern.minAge)) return false;
  if (pattern.maxAge != null && (age === undefined || age > pattern.maxAge)) return false;
  return true;
}

function buildResult(tier: RepairRiskTier, bounds: FactorBound, reason: string): FactorScore {
  let modifier: number;
  switch (tier) {
    case 'HIGH':
      modifier = bounds.min;
      break;
    case 'MEDIUM':
      modifier = 1;
      break;
    case 'LOW':
      modifier = bounds.max;
      break;
  }
  return {
    factor: 'repair-risk',
    modifier,
    subScore100: toSubScore100(modifier),
    reasons: [reason],
  };
}