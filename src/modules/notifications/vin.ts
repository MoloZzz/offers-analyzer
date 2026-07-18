/** Normalise a VIN for car-identity matching: upper-case, strip whitespace. '' when absent/too short. */
export function normalizeVin(vin?: string | null): string {
  if (!vin) return '';
  const v = vin.replace(/\s+/g, '').toUpperCase();
  return v.length >= 11 ? v : ''; // guard against junk/partial VINs
}
