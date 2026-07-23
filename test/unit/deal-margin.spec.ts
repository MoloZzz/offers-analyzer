import {
  deriveStage,
  marginStats,
  realizedDom,
  realizedMargin,
} from '../../src/modules/calibration/deal-margin';

describe('realizedMargin', () => {
  it('sell − buy − costs', () => {
    expect(realizedMargin({ buyPriceUsd: 8500, actualCostsUsd: 300, sellPriceUsd: 10200 })).toBe(
      1400,
    );
  });

  it('costs default to 0 when absent', () => {
    expect(realizedMargin({ buyPriceUsd: 8000, sellPriceUsd: 9000 })).toBe(1000);
  });

  it('null unless both buy and sell present', () => {
    expect(realizedMargin({ buyPriceUsd: 8000 })).toBeNull();
    expect(realizedMargin({ sellPriceUsd: 9000 })).toBeNull();
    expect(realizedMargin({})).toBeNull();
  });

  it('keeps a negative margin (loss-making deal)', () => {
    expect(realizedMargin({ buyPriceUsd: 9000, actualCostsUsd: 500, sellPriceUsd: 9000 })).toBe(
      -500,
    );
  });
});

describe('realizedDom', () => {
  it('operator-entered value wins over derived', () => {
    const boughtAt = new Date('2026-06-01');
    const soldAt = new Date('2026-07-01');
    expect(realizedDom({ daysOnMarket: 7, boughtAt, soldAt })).toBe(7);
  });

  it('derives from soldAt − boughtAt (whole days)', () => {
    expect(
      realizedDom({ boughtAt: new Date('2026-06-01'), soldAt: new Date('2026-06-22') }),
    ).toBe(21);
  });

  it('never negative', () => {
    expect(
      realizedDom({ boughtAt: new Date('2026-06-22'), soldAt: new Date('2026-06-01') }),
    ).toBe(0);
  });

  it('null when neither operator value nor both timestamps', () => {
    expect(realizedDom({ boughtAt: new Date('2026-06-01') })).toBeNull();
    expect(realizedDom({})).toBeNull();
  });
});

describe('deriveStage (monotonic)', () => {
  it('sell price ⇒ sold', () => {
    expect(deriveStage(null, { sellPriceUsd: 10000 })).toBe('sold');
    expect(deriveStage('bought', { sellPriceUsd: 10000 })).toBe('sold');
  });

  it('buy price ⇒ bought (unless already sold)', () => {
    expect(deriveStage(null, { buyPriceUsd: 8000 })).toBe('bought');
    expect(deriveStage('sold', { buyPriceUsd: 8000 })).toBe('sold');
  });

  it('decline reason ⇒ declined (unless already bought/sold)', () => {
    expect(deriveStage(null, { declineReason: 'price' })).toBe('declined');
    expect(deriveStage('bought', { declineReason: 'price' })).toBe('bought');
    expect(deriveStage('sold', { declineReason: 'price' })).toBe('sold');
  });

  it('bare patch keeps a prior stage / defaults to bought when new', () => {
    expect(deriveStage('declined', {})).toBe('declined');
    expect(deriveStage('sold', {})).toBe('sold');
    expect(deriveStage(null, {})).toBe('bought');
  });

  it("intent 'bought' (🛒 tap) overrides an earlier decline; 'declined' never overrides bought/sold", () => {
    expect(deriveStage('declined', { intent: 'bought' })).toBe('bought');
    expect(deriveStage('bought', { intent: 'declined' })).toBe('bought');
    expect(deriveStage('sold', { intent: 'declined' })).toBe('sold');
    expect(deriveStage(null, { intent: 'declined' })).toBe('declined');
  });
});

describe('marginStats', () => {
  it('aggregates median margin, loss share, median DOM over closed deals', () => {
    const stats = marginStats([
      { buyPriceUsd: 8000, sellPriceUsd: 9000, daysOnMarket: 10 }, // +1000
      { buyPriceUsd: 9000, actualCostsUsd: 500, sellPriceUsd: 9000, daysOnMarket: 30 }, // -500
      { buyPriceUsd: 7000, sellPriceUsd: 9200, daysOnMarket: 20 }, // +2200
    ]);
    expect(stats.closed).toBe(3);
    expect(stats.medianMarginUsd).toBe(1000);
    expect(stats.lossShare).toBe(0.33);
    expect(stats.medianDom).toBe(20);
  });

  it('excludes deals without a computable margin', () => {
    const stats = marginStats([
      { buyPriceUsd: 8000, sellPriceUsd: 9000 }, // +1000
      { buyPriceUsd: 8000 }, // no sell → excluded
    ]);
    expect(stats.closed).toBe(1);
    expect(stats.medianMarginUsd).toBe(1000);
  });

  it('even count → averaged median', () => {
    const stats = marginStats([
      { buyPriceUsd: 8000, sellPriceUsd: 9000 }, // +1000
      { buyPriceUsd: 8000, sellPriceUsd: 11000 }, // +3000
    ]);
    expect(stats.medianMarginUsd).toBe(2000);
  });

  it('no closed deals → nulls', () => {
    const stats = marginStats([{ buyPriceUsd: 8000 }]);
    expect(stats).toEqual({ closed: 0, medianMarginUsd: null, lossShare: null, medianDom: null });
  });
});
