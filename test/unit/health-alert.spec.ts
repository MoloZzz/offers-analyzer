import { decideHealthAlert } from '../../src/modules/health/health-alert';

describe('decideHealthAlert', () => {
  const STALE_MINUTES = 45;

  it('fresh: no alert', () => {
    expect(decideHealthAlert(5, false, STALE_MINUTES)).toEqual({ message: null, alerted: false });
  });

  it('goes stale: alerts down', () => {
    expect(decideHealthAlert(60, false, STALE_MINUTES)).toEqual({ message: 'down', alerted: true });
  });

  it('stays stale: no repeat alert', () => {
    expect(decideHealthAlert(90, true, STALE_MINUTES)).toEqual({ message: null, alerted: true });
  });

  it('recovers: alerts recovered', () => {
    expect(decideHealthAlert(5, true, STALE_MINUTES)).toEqual({ message: 'recovered', alerted: false });
  });
});
