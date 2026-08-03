import { Currency } from '../../src/common/types/money';
import {
  ProviderVehicleFacts,
  sourceProviderFact,
  unavailableProviderFact,
} from '../../src/modules/sources/ports/valuation-provider.port';
import {
  assessLegacyDelta,
  assessComparability,
  calculateLegacyDelta,
  fingerprintValuationProjection,
  redactValuationProjection,
  snapshotProviderFacts,
} from '../../src/modules/valuation/comparability';

function completeFacts(): ProviderVehicleFacts {
  return {
    categoryId: sourceProviderFact(1),
    make: sourceProviderFact('Audi'),
    model: sourceProviderFact('A6 Allroad'),
    markId: sourceProviderFact(9),
    modelId: sourceProviderFact(3219),
    year: sourceProviderFact(2004),
    generationId: sourceProviderFact(100),
    generationName: sourceProviderFact('C5'),
    modificationId: sourceProviderFact(200),
    modificationName: sourceProviderFact('3.0 TDI'),
    bodyId: sourceProviderFact(1),
    bodyName: sourceProviderFact('Універсал'),
    fuelId: sourceProviderFact(2),
    fuelName: sourceProviderFact('Дизель'),
    gearboxId: sourceProviderFact(1),
    gearboxName: sourceProviderFact('Автомат'),
    driveId: sourceProviderFact(4),
    driveName: sourceProviderFact('Повний'),
    mileageK: sourceProviderFact(260),
    location: sourceProviderFact({ stateId: 10, cityId: 1 }),
    vinEvidence: sourceProviderFact({ hasVinReport: true, vinChecked: true }),
    conditionEvidence: sourceProviderFact({ signalCodes: [] }),
  };
}

describe('provider evidence comparability', () => {
  it('marks complete, fresh available evidence eligible', () => {
    const now = new Date('2026-08-02T03:10:15.000Z');
    const assessment = assessComparability({
      status: 'available',
      queryMode: 'omni_id',
      facts: completeFacts(),
      sourceCapturedAt: now,
      providerStatisticsAvailable: true,
      providerComparableSummaryAvailable: true,
      providerReturnedComparableCount: 23,
      providerRetainedComparableCount: 20,
      now,
    });

    expect(assessment.comparability).toBe('eligible');
    expect(assessment.reasons).toEqual([]);
  });

  it('fails closed for missing mileage in attributes mode', () => {
    const facts = completeFacts();
    facts.mileageK = unavailableProviderFact<number>();
    const assessment = assessComparability({
      status: 'invalid_input',
      queryMode: 'attributes',
      facts,
      terminalReasons: ['invalid_input'],
    });

    expect(assessment.comparability).toBe('review');
    expect(assessment.reasons).toContain('attributes_mileage_required');
  });

  it('places stale, relaxed, or materially divergent evidence into review', () => {
    const assessment = assessComparability({
      status: 'available',
      queryMode: 'attributes',
      facts: completeFacts(),
      sourceCapturedAt: new Date('2026-07-30T00:00:00.000Z'),
      providerStatisticsAvailable: false,
      providerComparableSummaryAvailable: true,
      providerReturnedComparableCount: 2,
      providerRetainedComparableCount: 2,
      materialRelaxations: ['generation'],
      legacyDeltaPct: -26.74,
      now: new Date('2026-08-02T03:10:15.000Z'),
    });

    expect(assessment.comparability).toBe('review');
    expect(assessment.reasons).toEqual(
      expect.arrayContaining([
        'source_evidence_stale',
        'provider_statistics_unavailable',
        'material_relaxation:generation',
        'legacy_delta_at_least_20_pct',
      ]),
    );
  });

  it('fails closed for an omni-ID estimate with zero comparable cars and missing material dimensions', () => {
    const facts = completeFacts();
    facts.generationId = unavailableProviderFact<number>();
    facts.generationName = unavailableProviderFact<string>();
    facts.modificationId = unavailableProviderFact<number>();
    facts.modificationName = unavailableProviderFact<string>();
    const now = new Date('2026-08-02T03:10:15.000Z');

    const assessment = assessComparability({
      status: 'available',
      queryMode: 'omni_id',
      facts,
      sourceCapturedAt: now,
      providerStatisticsAvailable: true,
      providerComparableSummaryAvailable: true,
      providerReturnedComparableCount: 0,
      providerRetainedComparableCount: 0,
      now,
    });

    expect(assessment.comparability).toBe('review');
    expect(assessment.reasons).toEqual(
      expect.arrayContaining([
        'provider_comparable_evidence_insufficient',
        'material_dimension_missing:generation',
        'material_dimension_missing:modification',
      ]),
    );
    expect(assessment.inputCompleteness.missingMaterialDimensions).toEqual([
      'generation',
      'modification',
    ]);
  });

  it('marks an estimate for review when the provider omits its comparable summary entirely', () => {
    const now = new Date('2026-08-02T03:10:15.000Z');
    const assessment = assessComparability({
      status: 'available',
      queryMode: 'omni_id',
      facts: completeFacts(),
      sourceCapturedAt: now,
      providerStatisticsAvailable: true,
      providerComparableSummaryAvailable: false,
      now,
    });

    expect(assessment.comparability).toBe('review');
    expect(assessment.reasons).toContain('provider_comparable_summary_unavailable');
  });

  it('redacts sensitive values but preserves safe VIN evidence state and stable fingerprints', () => {
    const projection = redactValuationProjection({
      apiKey: 'never-store',
      vin: 'WAUZZZ...',
      vinEvidence: { hasVinReport: true, vinChecked: false },
      nested: { phone: '+380...', model: 'A6 Allroad' },
    });

    expect(projection).toMatchObject({
      apiKey: '[redacted]',
      vin: '[redacted]',
      vinEvidence: { hasVinReport: true, vinChecked: false },
      nested: { phone: '[redacted]', model: 'A6 Allroad' },
    });
    expect(fingerprintValuationProjection({ b: 2, a: 1 })).toBe(
      fingerprintValuationProjection({ a: 1, b: 2 }),
    );
  });

  it('records fact availability and calculates a provider-to-legacy delta without inventing a value', () => {
    const facts = snapshotProviderFacts(completeFacts());
    expect(facts.mileageK).toMatchObject({ availability: 'available', value: 260 });
    const delta = calculateLegacyDelta(
      { amount: 5000, currency: Currency.USD },
      { adjustedAmount: 6825, currency: Currency.USD },
    );
    expect(delta?.amount).toBe(-1825);
    expect(delta?.pct).toBeCloseTo(-26.7399267, 5);
    expect(calculateLegacyDelta(undefined, { adjustedAmount: 6825, currency: Currency.USD })).toBeNull();
  });

  it('does not subtract provider and legacy values across currencies', () => {
    const result = assessLegacyDelta(
      { amount: 200000, currency: Currency.UAH },
      { adjustedAmount: 6825, currency: Currency.USD },
    );

    expect(result.delta).toBeNull();
    expect(result.reason).toBe('legacy_currency_mismatch');
    expect(
      calculateLegacyDelta(
        { amount: 200000, currency: Currency.UAH },
        { adjustedAmount: 6825, currency: Currency.USD },
      ),
    ).toBeNull();
  });
});
