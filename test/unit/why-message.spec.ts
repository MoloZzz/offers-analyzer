import { Currency } from '../../src/common/types/money';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { formatWhy } from '../../src/modules/notifications/format/why-message';
import { ValuationResult } from '../../src/modules/valuation/valuation.service';

const detail: ListingDetail = {
  externalId: '38561317',
  make: 'BMW',
  model: '3 Series',
  markId: 1,
  modelId: 2,
  year: 2017,
  mileage: 127,
  sellerType: 'private',
  hasVinReport: true,
  url: 'https://auto.ria.com/auto_38561317.html',
  price: { amount: 12000, currency: Currency.USD },
  risk: {
    damaged: false,
    salvage: false,
    unclearCustoms: false,
    confiscated: false,
    underCredit: false,
    abroad: false,
    vinChecked: false,
  },
  description: 'потребує ремонту двигуна',
};

const result: ValuationResult = {
  isOpportunity: true,
  discountPct: 25,
  confidence: 0.9,
  score: 0.75,
  redFlags: { damaged: false, no_vin_report: false, desc_needs_repair: true },
  reason: 'deal score 0.75 ≥ threshold 0.3',
  raw: 0.83,
  penalty: 0.9,
  disqualified: false,
  priceCore: 0.75,
  factors: [],
  total100: 88,
};

describe('formatWhy', () => {
  it('explains the score breakdown and surfaces description-derived risks', () => {
    const msg = formatWhy(detail, result, {
      fairValue: 16000,
      currency: Currency.USD,
      sampleSize: 12,
      benchmarkBase: 16000,
      mileageAware: true,
    });

    expect(msg).toContain('Чому такий бал');
    expect(msg).toContain('знижка 25%');
    expect(msg).toContain('Розклад балу: знижка → raw 0.83 × впевненість 0.9 × штраф 0.9 = 0.75');
    expect(msg).toContain('опис:');
    expect(msg).toContain('потребує ремонту');
  });

  it('shows the mileage correction when the cohort is not mileage-aware', () => {
    const msg = formatWhy(detail, result, {
      fairValue: 16000,
      currency: Currency.USD,
      sampleSize: 12,
      benchmarkBase: 15500,
      mileageAware: false,
    });

    expect(msg).toContain('Поправка на пробіг');
  });
});
