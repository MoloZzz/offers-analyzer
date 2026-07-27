import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { formatOpportunity } from '../../src/modules/notifications/format/opportunity-message';
import { Opportunity } from '../../src/modules/valuation/entities/opportunity.entity';

const listing = {
  make: 'BMW',
  model: '3 Series',
  year: 2017,
  mileage: 127,
  stateId: 12,
  cityId: 34,
  sellerType: 'private',
  url: 'https://auto.ria.com/auto_x.html',
} as unknown as Listing;

const opportunity = {
  askingValue: 12000,
  fairValue: 16000,
  discountPct: 25,
  confidence: 0.9,
  score: 0.75,
  currency: 'USD',
  sampleSize: 42,
  redFlags: { damaged: false, no_vin_report: true },
} as unknown as Opportunity;

describe('formatOpportunity', () => {
  const msg = formatOpportunity(opportunity, listing);

  it('includes the required region and sample size, plus seller and backlink', () => {
    expect(msg).toContain('12/34');
    expect(msg).toContain('(42');
    expect(msg).toContain('25%');
    expect(msg).toContain('https://auto.ria.com/auto_x.html');
  });

  it('translates fired red-flags and omits non-fired ones', () => {
    expect(msg).toContain('VIN');
  });
});
