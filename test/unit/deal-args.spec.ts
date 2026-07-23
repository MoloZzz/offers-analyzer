import { parseDealArgs } from '../../src/modules/notifications/telegram/deal-args';

describe('parseDealArgs', () => {
  it('parses all fields', () => {
    const { patch, error } = parseDealArgs('buy=8500 costs=300 sell=10200 dom=21 reason=price');
    expect(error).toBeUndefined();
    expect(patch).toEqual({
      buyPriceUsd: 8500,
      actualCostsUsd: 300,
      sellPriceUsd: 10200,
      daysOnMarket: 21,
      declineReason: 'price',
    });
  });

  it('every field optional — a partial patch is fine', () => {
    expect(parseDealArgs('sell=9000').patch).toEqual({ sellPriceUsd: 9000 });
    expect(parseDealArgs('').patch).toEqual({});
  });

  it('rounds dom to whole days, keeps money decimals', () => {
    const { patch } = parseDealArgs('buy=8500.5 dom=20.7');
    expect(patch.buyPriceUsd).toBe(8500.5);
    expect(patch.daysOnMarket).toBe(21);
  });

  it('collects a trailing free-text note', () => {
    const { patch } = parseDealArgs('buy=8000 продав знайомому швидко');
    expect(patch.buyPriceUsd).toBe(8000);
    expect(patch.note).toBe('продав знайомому швидко');
  });

  it('rejects a bad number', () => {
    const { error } = parseDealArgs('buy=abc');
    expect(error).toContain('buy');
  });

  it('rejects a negative number', () => {
    expect(parseDealArgs('sell=-100').error).toBeDefined();
  });

  it('rejects an unknown decline reason', () => {
    const { error } = parseDealArgs('reason=weather');
    expect(error).toContain('weather');
  });
});
