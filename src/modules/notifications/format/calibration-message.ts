import { CalibrationLine } from '../../calibration/calibration.service';

/** Ukrainian summary of a calibration run for the bot / weekly broadcast. */
export function formatCalibration(lines: CalibrationLine[], mode: 'propose' | 'auto'): string {
  const header = `🎯 Калібрування порогів (${mode === 'auto' ? 'авто' : 'пропозиція'})`;
  if (lines.length === 0) return `${header}\nНемає активних профілів.`;
  const body = lines.map((l) => {
    if (l.after == null) return `• ${l.profileName}: без змін — ${l.reason}`;
    const state = l.applied ? 'застосовано' : 'пропозиція';
    return `• ${l.profileName}: ${l.before ?? '?'} → ${l.after} — ${l.reason} (${state})`;
  });
  return [header, ...body].join('\n');
}
