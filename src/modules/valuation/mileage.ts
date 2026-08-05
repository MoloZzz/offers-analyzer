import { Injectable } from '@nestjs/common';

import { ParametersService } from '../calibration/parameters.service';
import { ListingDetail } from '../sources/ports/listing-source.port';

import { ResolvedBenchmark } from './cohort';

/**
 * Analytic mileage correction (M2), percentage model (chosen for simplicity).
 *
 * A benchmark taken from a **non-mileage-banded** cohort averages cars of all mileages, so it
 * over-values a high-mileage car. We lower the fair value by how far the listing's mileage exceeds
 * what's *typical for its age*:
 *
 *   expected = age × annualK                          (thousand km)
 *   pct      = min(0, (expected − actual) / 10 × per10kPct)   → clamped to [−maxAdjPct, 0]
 *   fair'    = fair × (1 + pct/100)
 *
 * **One-sided by construction:** more km than typical → fair down; fewer km than typical → *no
 * change*, never up. The odometer is a seller-typed number that AUTO.RIA does not verify, and
 * understating it is the cheapest way to fake a bargain — an uplift driven by that number turns the
 * scam into a high discount and pushes trash listings at the operator. Making the cap zero here
 * means no caller, present or future, can produce an uplift from a claimed odometer; the previous
 * VIN-evidenced exception (ADR-0014) is gone, because even a VIN check does not attest the reading.
 * Pure + deterministic (inject `now` in tests).
 */
export interface MileageAdjustOptions {
  /** Expected thousand km driven per year of age. */
  annualK: number;
  /** Percent fair-value change per 10 000 km deviation from expected. */
  per10kPct: number;
  /** Absolute cap on the (always downward) adjustment, in percent. */
  maxAdjPct: number;
  /** Reference "now" (defaults to the current date). */
  now?: Date;
}

export function expectedMileageK(year: number, annualK: number, now: Date = new Date()): number {
  const age = Math.max(0, now.getFullYear() - year);
  return age * annualK;
}

/**
 * Non-positive, clamped percentage adjustment for a listing's mileage vs. what's typical for its
 * age. Always in [−maxAdjPct, 0]: a below-typical odometer is claimed, not measured, so it buys the
 * listing nothing.
 */
export function mileageAdjustmentPct(
  mileageK: number,
  year: number,
  opts: MileageAdjustOptions,
): number {
  const expected = expectedMileageK(year, opts.annualK, opts.now);
  const excessK = mileageK - expected; // >0: more worn than typical → worth less
  if (excessK <= 0) return 0; // at or below typical: claimed, not measured — no effect (avoids −0 too)
  return clamp(-(excessK / 10) * opts.per10kPct, -opts.maxAdjPct, 0);
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
 * mileage-banded (like-for-like) the benchmark is used as-is; otherwise the analytic correction runs
 * and can only lower it.
 */
@Injectable()
export class MileageAdjuster {
  constructor(private readonly parameters: ParametersService) {}

  /** Fair value in the benchmark's currency, never raised by the claimed odometer. */
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
