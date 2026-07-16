import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { Currency } from '../../src/common/types/money';
import { cohortCandidates, MILEAGE_BAND_K } from '../../src/modules/valuation/cohort';

function detail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    externalId: '1',
    make: 'BMW',
    model: '3 Series',
    markId: 9,
    modelId: 3219,
    year: 2017,
    mileage: 120,
    sellerType: 'private',
    hasVinReport: true,
    url: 'https://auto.ria.com/uk/auto_1.html',
    price: { amount: 12000, currency: Currency.USD },
    risk: {
      damaged: false,
      salvage: false,
      unclearCustoms: false,
      confiscated: false,
      underCredit: false,
      abroad: false,
    },
    ...overrides,
  };
}

describe('cohortCandidates (mileage-aware, widest-data fallback)', () => {
  it('puts the mileage-banded cohort first, then year±1, then make+model', () => {
    const [banded, yearRange, model] = cohortCandidates(detail({ year: 2017, mileage: 120 }));

    expect(banded).toEqual({
      markId: 9,
      modelId: 3219,
      yearFrom: 2016,
      yearTo: 2018,
      mileageFrom: 120 - MILEAGE_BAND_K,
      mileageTo: 120 + MILEAGE_BAND_K,
    });
    expect(yearRange).toEqual({ markId: 9, modelId: 3219, yearFrom: 2016, yearTo: 2018 });
    expect(model).toEqual({ markId: 9, modelId: 3219 });
  });

  it('floors the lower mileage bound at 0 for low-mileage cars', () => {
    const [banded] = cohortCandidates(detail({ mileage: 10 }));
    expect(banded.mileageFrom).toBe(0);
    expect(banded.mileageTo).toBe(10 + MILEAGE_BAND_K);
  });

  it('omits the banded cohort when mileage is unknown', () => {
    const candidates = cohortCandidates(detail({ mileage: undefined }));
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.mileageFrom === undefined)).toBe(true);
  });

  it('never constrains by city (city starves the sample)', () => {
    const candidates = cohortCandidates(detail({ cityId: 287 }));
    expect(candidates.every((c) => c.cityId === undefined)).toBe(true);
  });
});
