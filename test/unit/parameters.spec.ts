import { buildSeedParams } from '../../src/modules/calibration/parameters.service';

describe('buildSeedParams', () => {
  it('builds the v1 seed matching the current hard-coded constants (SC-006)', () => {
    const params = buildSeedParams({
      mileageAnnualK: 15,
      mileagePer10kPct: 2,
      mileageMaxAdjPct: 20,
    });

    expect(params).toEqual({
      scale: 30,
      softFlagPenalty: 0.8,
      mileageAnnualK: 15,
      mileagePer10kPct: 2,
      mileageMaxAdjPct: 20,
      factorBounds: {},
      heuristicTableHashes: {},
      upliftCap: 1.25,
      // spec 006 US6.1 — enables assessment confidence with the code default weights. It gates
      // nothing, so seeding it changes no score (asserted by `valuation-additivity.spec.ts`).
      confidenceWeights: {},
    });
  });
});
