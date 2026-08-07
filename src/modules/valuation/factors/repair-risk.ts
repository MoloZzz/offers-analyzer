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

  const resolved = resolveRepairRiskTier(input, table);
  if (resolved) return buildResult(resolved.tier, bounds, resolved.reason);

  // Unknown → neutral with reason
  return { factor: 'repair-risk', modifier: 1, subScore100: toSubScore100(1), reasons: ['ризик ремонтності невідомий'] };
}

/** What the curated table says about a listing, and why. `null` = the table has no opinion. */
export interface ResolvedRepairRisk {
  tier: RepairRiskTier;
  reason: string;
  /** How the tier was reached — a model entry, a make entry, or a pattern rule. */
  via: 'model' | 'make' | 'pattern';
}

/**
 * The curated table's verdict, split out of `repairRiskFactor` so a reader can consult the table
 * **without** taking a scoring modifier with it (spec 017 T033 shows the curated tier beside a
 * model's claim). Resolution order is unchanged: explicit model, explicit make, then pattern rules,
 * preferring HIGH > MEDIUM > LOW. Nothing here writes; the curated table is edited only by a human.
 */
export function resolveRepairRiskTier(
  input: RepairRiskInput,
  table: RepairRiskTable,
): ResolvedRepairRisk | null {
  const make = input.make?.trim().toLowerCase();
  const model = input.model?.trim().toLowerCase();
  if (!make || !model) return null;

  const modelTier = table.models[`${make}|${model}`];
  if (modelTier) return { tier: modelTier, reason: TIER_REASON[modelTier], via: 'model' };

  const makeTier = table.makes[make];
  if (makeTier) return { tier: makeTier, reason: TIER_REASON[makeTier], via: 'make' };

  const currentYear = new Date().getFullYear();
  const age = input.year ? currentYear - input.year : undefined;

  let bestTier: RepairRiskTier | null = null;
  let bestReason = '';
  for (const pattern of table.patterns) {
    if (!matchesPattern(pattern, input, age)) continue;
    if (
      pattern.tier === 'HIGH' ||
      (pattern.tier === 'MEDIUM' && bestTier !== 'HIGH') ||
      (pattern.tier === 'LOW' && !bestTier)
    ) {
      bestTier = pattern.tier;
      bestReason = pattern.reason;
    }
  }

  return bestTier ? { tier: bestTier, reason: bestReason, via: 'pattern' } : null;
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