import { CalibrationLine } from '../../src/modules/calibration/calibration.service';
import { formatCalibration } from '../../src/modules/notifications/format/calibration-message';

describe('formatCalibration', () => {
  it('includes header, before→after, and applied state for an applied line (auto mode)', () => {
    const lines: CalibrationLine[] = [
      { profileName: 'BMW', before: 0.6, after: 0.7, applied: true, reason: 'забагато кандидатів' },
    ];
    const text = formatCalibration(lines, 'auto');
    expect(text).toContain('🎯 Калібрування');
    expect(text).toContain('BMW');
    expect(text).toContain('0.6 → 0.7');
    expect(text).toContain('застосовано');
    expect(text).toContain('авто');
  });

  it('shows "без змін" for a no-change line', () => {
    const lines: CalibrationLine[] = [
      { profileName: 'BMW', before: 0.6, after: null, applied: false, reason: 'у межах цілі' },
    ];
    const text = formatCalibration(lines, 'propose');
    expect(text).toContain('без змін');
  });

  it('reports no active profiles for an empty array', () => {
    const text = formatCalibration([], 'propose');
    expect(text).toContain('Немає активних профілів');
  });
});
