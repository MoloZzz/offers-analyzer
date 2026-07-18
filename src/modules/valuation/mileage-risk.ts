/**
 * Cheap odometer-fraud / "too good to be true" heuristics (B21a). The AUTO.RIA API doesn't give the
 * real VIN-verified mileage, so we flag suspicious cases rather than eliminate them. Pure + deterministic.
 */
export interface MileageRiskInput {
  mileageK?: number;   // claimed mileage, thousand km
  year?: number;       // model year
  discountPct: number; // % below fair value (from valuation)
  hasVinReport: boolean;
  vinChecked?: boolean;
  now?: Date;
}
export interface MileageRiskOptions {
  minPlausibleAnnualK: number;  // below this avg km/yr for the age = suspiciously low
  unverifiedBargainPct: number; // discount at/above this + no VIN verification = suspicious bargain
}
export interface MileageRiskSignals {
  suspiciousLowMileage: boolean;
  unverifiedBargain: boolean;
}
export const DEFAULT_MILEAGE_RISK: MileageRiskOptions = { minPlausibleAnnualK: 5, unverifiedBargainPct: 25 };

export function assessMileageRisk(input: MileageRiskInput, opts: MileageRiskOptions = DEFAULT_MILEAGE_RISK): MileageRiskSignals {
  const now = input.now ?? new Date();
  const verified = input.hasVinReport || input.vinChecked === true;
  const unverifiedBargain = input.discountPct >= opts.unverifiedBargainPct && !verified;

  let suspiciousLowMileage = false;
  if (input.mileageK != null && input.mileageK > 0 && input.year != null && input.year > 0) {
    const age = Math.max(1, now.getFullYear() - input.year); // at least 1 yr to avoid brand-new cars
    suspiciousLowMileage = input.mileageK < age * opts.minPlausibleAnnualK;
  }
  return { suspiciousLowMileage, unverifiedBargain };
}
