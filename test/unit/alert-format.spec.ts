import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { formatOpportunity } from '../../src/modules/notifications/format/opportunity-message';
import { Opportunity } from '../../src/modules/valuation/entities/opportunity.entity';

const listing = {
  make: 'BMW',
  model: '3 Series',
  year: 2017,
  mileage: 127,
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
  redFlags: { damaged: false, no_vin_report: true },
} as unknown as Opportunity;

describe('formatOpportunity', () => {
  const msg = formatOpportunity(opportunity, listing);

  it('includes the deal score, discount, seller and a working backlink', () => {
    expect(msg).toContain('Вигідність: +0.75');
    expect(msg).toContain('25%');
    expect(msg).toContain('приватний');
    expect(msg).toContain('https://auto.ria.com/auto_x.html');
  });

  it('translates fired red-flags and omits non-fired ones', () => {
    expect(msg).toContain('немає VIN-звіту');
    expect(msg).not.toContain('була в ДТП');
  });
});
