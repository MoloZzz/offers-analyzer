import { ConfidenceInputKey } from '../../valuation/valuation.types';

/**
 * One operator-facing name per assessment-confidence input (spec 006 US6.1).
 *
 * Shared deliberately: the alert line and `/why` render the same seven keys, and two independent
 * label maps had already drifted ("вибірка порівнянь" vs "обсяг вибірки порівнянних") before this
 * was consolidated. Divergent names for the same input read to an operator as different inputs.
 *
 * These are the *input names*. The per-listing reason text lives on the weight table in
 * `assessment-confidence.ts`, so a weight and its explanation cannot desync; both are Ukrainian,
 * matching every other operator surface.
 */
export const CONFIDENCE_INPUT_LABELS: Record<ConfidenceInputKey, string> = {
  vin_checked: 'перевірка VIN джерелом',
  vin_report: 'VIN-звіт',
  cohort_sample: 'обсяг вибірки порівнянних',
  cohort_tier: 'схожість когорти',
  drivetrain_fields: 'технічні поля авто',
  description: 'опис продавця',
  mileage_plausible: 'правдоподібність пробігу',
};

/** An unknown key is shown raw rather than dropped — a missing reason is worse than an ugly one. */
export function confidenceInputLabel(key: string): string {
  return CONFIDENCE_INPUT_LABELS[key as ConfidenceInputKey] ?? key;
}
