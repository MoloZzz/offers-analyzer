/**
 * Predeclared coverage corpus for the shadow/provider parity audit. An entry without a listing ID
 * is a required operator capture, not a fabricated source example. The corpus is deliberately
 * separate from score configuration and contains no VIN, seller, or contact data.
 */
export interface ValuationGoldCase {
  key: string;
  sourceListingId?: string;
  strata: readonly string[];
  status: 'captured_fixture' | 'pending_operator_capture';
  manualParity?: {
    capturedAt: string;
    publicEstimateAmount: number;
    currency: 'USD';
    minimumAmount?: number;
    maximumAmount?: number;
    source: 'auto_ria_public_calculator';
  };
}

export const VALUATION_GOLD_CASES: readonly ValuationGoldCase[] = [
  {
    key: 'audi-a6-allroad-2004-38266770',
    sourceListingId: '38266770',
    strata: ['old', 'niche', 'high_mileage', 'condition_ambiguous'],
    status: 'captured_fixture',
    manualParity: {
      capturedAt: '2026-08-02T03:10:15.000Z',
      publicEstimateAmount: 5000,
      currency: 'USD',
      minimumAmount: 4882,
      maximumAmount: 5395,
      source: 'auto_ria_public_calculator',
    },
  },
  {
    key: 'coverage-dealer-private',
    strata: ['dealer', 'private'],
    status: 'pending_operator_capture',
  },
  {
    key: 'coverage-regional',
    strata: ['regional'],
    status: 'pending_operator_capture',
  },
  {
    key: 'coverage-vin-unverified',
    strata: ['vin_unverified'],
    status: 'pending_operator_capture',
  },
];

export function goldCaseForExternalId(externalId: string): ValuationGoldCase | undefined {
  return VALUATION_GOLD_CASES.find((goldCase) => goldCase.sourceListingId === externalId);
}

export const REQUIRED_GOLD_STRATA = [
  'old',
  'niche',
  'high_mileage',
  'dealer',
  'private',
  'regional',
  'vin_unverified',
  'condition_ambiguous',
] as const;
