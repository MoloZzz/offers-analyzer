import { decideRelistAlert } from '../../src/modules/notifications/alerted-cars.service';
import { normalizeVin } from '../../src/modules/notifications/vin';

describe('normalizeVin', () => {
  it('upper-cases and strips whitespace', () => {
    expect(normalizeVin('  jmzbk12z ea1 234567 ')).toBe('JMZBK12ZEA1234567');
  });

  it('returns empty string when absent', () => {
    expect(normalizeVin(undefined)).toBe('');
  });

  it('returns empty string for junk/partial VINs (< 11 chars)', () => {
    expect(normalizeVin('SHORT')).toBe('');
  });
});

describe('decideRelistAlert', () => {
  it('alerts the first time (no prior lowest)', () => {
    expect(decideRelistAlert(null, 12000)).toBe('first');
  });

  it('alerts when cheaper than the lowest ever alerted', () => {
    expect(decideRelistAlert(12000, 11000)).toBe('cheaper');
  });

  it('suppresses when equal to the lowest ever alerted', () => {
    expect(decideRelistAlert(12000, 12000)).toBe('suppress');
  });

  it('suppresses when more expensive than the lowest ever alerted', () => {
    expect(decideRelistAlert(12000, 13000)).toBe('suppress');
  });
});
