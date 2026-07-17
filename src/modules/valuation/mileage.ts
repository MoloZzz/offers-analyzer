import { Injectable } from '@nestjs/common';

import { ParametersService } from '../calibration/parameters.service';
import { ListingDetail } from '../sources/ports/listing-source.port';

import { ResolvedBenchmark } from './cohort';

/**
 * Analytic mileage correction (M2), percentage model (chosen for simplicity).
 *
 * A benchmark taken from a **non-mileage-banded** cohort averages cars of all mileages, so it
 * over-values a high-mileage car and under-values a low-mileage one. We nudge the fair value by how
 * far the listing's mileage deviates from what's *typical for its age*:
 *
 *   expected = age × annualK                 (thousand km)
 *   pct      = (expected − actual) / 10 × per10kPct     → clamped to ±maxAdjPct
 *   fair'    = fair × (1 + pct/100)
 *
 * Fewer km than typical → fair up; more km → fair down. Pure + deterministic (inject `now` in tests).
 */
export interface MileageAdjustOptions {
  /** Expected thousand km driven per year of age. */
  annualK: number;
  /** Percent fair-value change per 10 000 km deviation from expected. */
  per10kPct: number;
  /** Absolute cap on the adjustment, in percent. */
  maxAdjPct: number;
  /** Reference "now" (defaults to the current date). */
  now?: Date;
}

export function expectedMileageK(year: number, annualK: number, now: Date = new Date()): number {
  const age = Math.max(0, now.getFullYear() - year);
  return age * annualK;
}

/** Signed, clamped percentage adjustment for a listing's mileage vs. what's typical for its age. */
export function mileageAdjustmentPct(
  mileageK: number,
  year: number,
  opts: MileageAdjustOptions,
): number {
  const expected = expectedMileageK(year, opts.annualK, opts.now);
  const deviationK = expected - mileageK; // >0: less worn than typical → worth more
  const pct = (deviationK / 10) * opts.per10kPct;
  return clamp(pct, -opts.maxAdjPct, opts.maxAdjPct);
}

/** Apply the mileage correction to a fair value. No-op when fair or mileage is unusable. */
export function adjustFairForMileage(
  fair: number,
  mileageK: number | undefined,
  year: number,
  opts: MileageAdjustOptions,
): number {
  if (!(fair > 0) || mileageK == null || mileageK <= 0 || !(year > 0)) return fair;
  return fair * (1 + mileageAdjustmentPct(mileageK, year, opts) / 100);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Resolves the mileage-corrected fair value for a listing. When the matched cohort was already
 * mileage-banded (like-for-like) the benchmark is used as-is; otherwise the analytic correction runs.
 */
@Injectable()
export class MileageAdjuster {
  constructor(private readonly parameters: ParametersService) {}

  /** Fair value in the benchmark's currency, corrected for mileage when appropriate. */
  fairValue(benchmark: ResolvedBenchmark, detail: ListingDetail): number {
    if (benchmark.mileageAware) return benchmark.value.amount;
    const p = this.parameters.params();
    return adjustFairForMileage(benchmark.value.amount, detail.mileage, detail.year, {
      annualK: p.mileageAnnualK,
      per10kPct: p.mileagePer10kPct,
      maxAdjPct: p.mileageMaxAdjPct,
    });
  }
}
