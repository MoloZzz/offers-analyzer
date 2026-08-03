import { getMetadataArgsStorage } from 'typeorm';

import { Currency } from '../../src/common/types/money';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { Opportunity } from '../../src/modules/valuation/entities/opportunity.entity';
import { ValuationEvidence } from '../../src/modules/valuation/entities/valuation-evidence.entity';
import { ValuationPolicyVersion } from '../../src/modules/valuation/entities/valuation-policy-version.entity';
import {
  EvaluationExplanationV1,
  withProviderEvidence,
} from '../../src/modules/valuation/evaluation-explanation';

function baseExplanation(): EvaluationExplanationV1 {
  return {
    schemaVersion: 1,
    evaluatedAt: '2026-08-02T03:10:15.000Z',
    parameterSetVersion: 1,
    thresholdUsed: 0.3,
    listing: {
      externalId: '38266770',
      make: 'Audi',
      model: 'A6 Allroad',
      year: 2004,
      url: 'https://auto.ria.com/auto_audi_a6_allroad_38266770.html',
      askingAmount: 5000,
      currency: Currency.USD,
    },
    cohort: { sampleSize: 23, mileageAware: false },
    fairValueBase: 6500,
    fairValueAdjusted: 6825,
    mileageAdjustment: 325,
    discountPct: 26.74,
    raw: 0.89,
    confidence: 1,
    penalty: 1,
    score: 0.89,
    priceCore: 0.89,
    total100: 95,
    factors: [],
    firedFlags: [],
    redFlags: {},
    reason: 'deal score 0.89 ≥ threshold 0.3',
    isOpportunity: true,
    disqualified: false,
  };
}

describe('valuation evidence persistence mapping', () => {
  it('defines immutable policy/evidence tables and named audit indexes', () => {
    const storage = getMetadataArgsStorage();
    const evidenceColumns = storage.columns
      .filter((column) => column.target === ValuationEvidence)
      .map((column) => column.propertyName);
    const policyColumns = storage.columns
      .filter((column) => column.target === ValuationPolicyVersion)
      .map((column) => column.propertyName);
    const evidenceIndexes = storage.indices
      .filter((index) => index.target === ValuationEvidence)
      .map((index) => index.name);

    expect(policyColumns).toEqual(expect.arrayContaining(['key', 'target', 'status', 'rules']));
    expect(evidenceColumns).toEqual(
      expect.arrayContaining([
        'policySnapshot',
        'requestFingerprint',
        'inputSnapshot',
        'requestProjection',
        'comparabilityReasons',
        'inputCompleteness',
        'chargeStatus',
      ]),
    );
    expect(evidenceIndexes).toEqual(
      expect.arrayContaining([
        'IDX_valuation_evidence_listing_created_at',
        'IDX_valuation_evidence_request_policy_created_at',
        'IDX_valuation_evidence_status_created_at',
      ]),
    );
  });

  it('adds only nullable evidence pointers to legacy listing and opportunity projections', () => {
    const storage = getMetadataArgsStorage();
    const listingPointer = storage.columns.find(
      (column) => column.target === Listing && column.propertyName === 'lastValuationEvidenceId',
    );
    const opportunityPointer = storage.columns.find(
      (column) => column.target === Opportunity && column.propertyName === 'valuationEvidenceId',
    );

    expect(listingPointer?.options.nullable).toBe(true);
    expect(opportunityPointer?.options.nullable).toBe(true);
  });
});

describe('evaluation explanation V2 compatibility', () => {
  it('keeps every V1 score field while adding an optional provider-evidence reference', () => {
    const v1 = baseExplanation();
    const v2 = withProviderEvidence(v1, {
      evidenceId: 'evidence-1',
      target: 'active_listing_ask',
      providerKey: 'auto-ria-ai',
      policyKey: 'ai-shadow-v1',
      adapterVersion: 'v1',
      status: 'available',
      comparability: 'review',
      sourceCapturedAt: '2026-08-02T03:10:15.000Z',
      queryMode: 'omni_id',
      estimateAvailable: true,
      rangeAvailable: true,
      legacyDeltaPct: -26.74,
      reasonCodes: ['legacy_delta_at_least_20_pct'],
    });

    expect(v2.schemaVersion).toBe(2);
    expect(v2.score).toBe(v1.score);
    expect(v2.fairValueAdjusted).toBe(v1.fairValueAdjusted);
    expect(v2.providerEvidence?.evidenceId).toBe('evidence-1');
  });
});
