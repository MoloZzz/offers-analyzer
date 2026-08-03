import { sourceProviderFact, unavailableProviderFact } from '../../src/modules/sources/ports/valuation-provider.port';
import {
  AI_SHADOW_V1_POLICY,
  decideValuationQueryMode,
  deterministicSampleUnit,
  selectDeterministicShadowSample,
  snapshotValuationPolicy,
} from '../../src/modules/valuation/valuation-policy';

describe('ai-shadow-v1 valuation policy', () => {
  it('prefers an omni ID even when optional attribute facts are unavailable', () => {
    const decision = decideValuationQueryMode({
      omniId: '38266770',
      facts: {
        make: sourceProviderFact('Audi'),
        model: sourceProviderFact('A6 Allroad'),
        year: sourceProviderFact(2004),
        mileageK: unavailableProviderFact<number>(),
      },
    });

    expect(decision).toEqual({ queryMode: 'omni_id', reasons: [] });
  });

  it('blocks attributes mode before any provider call when actual mileage is missing', () => {
    const decision = decideValuationQueryMode({
      facts: {
        make: sourceProviderFact('Audi'),
        model: sourceProviderFact('A6 Allroad'),
        year: sourceProviderFact(2004),
        mileageK: unavailableProviderFact<number>(),
      },
      requestedMode: 'attributes',
    });

    expect(decision.queryMode).toBeUndefined();
    expect(decision.reasons).toContain('attributes_mileage_required');
  });

  it('blocks attributes mode when a legacy zero sentinel is the only ID/year value', () => {
    const decision = decideValuationQueryMode({
      facts: {
        categoryId: sourceProviderFact(0),
        make: sourceProviderFact('Audi'),
        model: sourceProviderFact('A6 Allroad'),
        markId: sourceProviderFact(0),
        modelId: sourceProviderFact(0),
        year: sourceProviderFact(0),
        mileageK: sourceProviderFact(260),
      },
      requestedMode: 'attributes',
    });

    expect(decision.queryMode).toBeUndefined();
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        'missing_required_fact:categoryId',
        'missing_required_fact:markId',
        'missing_required_fact:modelId',
        'missing_required_fact:year',
      ]),
    );
  });

  it('selects deterministic shadow samples and respects disabled/full rates', () => {
    expect(selectDeterministicShadowSample('38266770', 'ai-shadow-v1', 0)).toBe(false);
    expect(selectDeterministicShadowSample('38266770', 'ai-shadow-v1', 1)).toBe(true);
    expect(deterministicSampleUnit('38266770', 'ai-shadow-v1')).toBe(
      deterministicSampleUnit('38266770', 'ai-shadow-v1'),
    );
    expect(deterministicSampleUnit('38266770', 'ai-shadow-v1')).not.toBe(
      deterministicSampleUnit('38266770', 'another-policy'),
    );
  });

  it('stores a stable policy snapshot rather than exposing mutable scoring parameters', () => {
    const snapshot = snapshotValuationPolicy(AI_SHADOW_V1_POLICY);

    expect(snapshot.key).toBe('ai-shadow-v1');
    expect(snapshot.target).toBe('active_listing_ask');
    expect(snapshot.rules.attributeRequiredFacts).toContain('mileageK');
    expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(AI_SHADOW_V1_POLICY)).toBe(true);
  });
});
