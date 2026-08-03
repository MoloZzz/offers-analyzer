import {
  REQUIRED_GOLD_STRATA,
  VALUATION_GOLD_CASES,
  goldCaseForExternalId,
} from '../../src/modules/valuation/valuation-gold-cases';
import fixture from '../fixtures/valuation-gold-cases.json';

describe('valuation gold-case registry', () => {
  it('covers every preregistered audit stratum without inventing missing listing IDs', () => {
    const strata = new Set(VALUATION_GOLD_CASES.flatMap((goldCase) => goldCase.strata));
    expect(REQUIRED_GOLD_STRATA.every((stratum) => strata.has(stratum))).toBe(true);
    expect(goldCaseForExternalId('38266770')?.manualParity?.publicEstimateAmount).toBe(5000);
    expect(VALUATION_GOLD_CASES.filter((goldCase) => !goldCase.sourceListingId)).not.toHaveLength(0);
  });

  it('keeps the operator fixture aligned with the runtime audit registry', () => {
    expect(fixture.cases).toEqual(VALUATION_GOLD_CASES);
  });
});
