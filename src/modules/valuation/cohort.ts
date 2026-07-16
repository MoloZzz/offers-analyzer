import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { CohortQuery, ListingDetail, ListingSource } from '../sources/ports/listing-source.port';

import { BenchmarkCacheService, BenchmarkValue } from './benchmark-cache.service';

/** A cohort's average is only trustworthy with at least this many comparable listings. */
const MIN_USEFUL_SAMPLES = 10;

/** Half-width of the mileage band (thousand km) around the listing's own mileage — see M1 (banded). */
export const MILEAGE_BAND_K = 25;

/**
 * Cohorts to try, from the most specific (mileage-matched) to the widest — widest-DATA fallback.
 * `resolveBenchmark` walks these until one has enough samples.
 *
 * - **Mileage-banded** (make+model+year±1+mileage±25k km) — a true like-for-like average, so a
 *   high-mileage car isn't judged against low-mileage comparables. Only kept when we know mileage.
 * - **Year±1 nationwide** (drop mileage) — the unblocker: narrow cohorts (make+model+city+exact
 *   year+mileage) collapse the sample to ~1 and the confidence gate rejects everything (see
 *   research/why-no-opportunities). This usually has hundreds of comparables.
 * - **Make+model only** — last resort so we still produce *some* benchmark.
 *
 * City is deliberately never used (it starves the sample). When we fall back off the banded cohort,
 * an analytic mileage correction compensates (M2).
 */
export function cohortCandidates(d: ListingDetail): CohortQuery[] {
  const base = { markId: d.markId, modelId: d.modelId };
  const candidates: CohortQuery[] = [];
  if (d.mileage != null && d.mileage > 0) {
    candidates.push({
      ...base,
      yearFrom: d.year - 1,
      yearTo: d.year + 1,
      mileageFrom: Math.max(0, d.mileage - MILEAGE_BAND_K),
      mileageTo: d.mileage + MILEAGE_BAND_K,
    });
  }
  candidates.push({ ...base, yearFrom: d.year - 1, yearTo: d.year + 1 });
  candidates.push(base);
  return candidates;
}

/**
 * Resolve a usable benchmark, widening the cohort until it has enough samples. Returns null when
 * even the widest cohort has no usable data. A budget-exhausted error propagates (stops the cycle).
 */
export async function resolveBenchmark(
  source: ListingSource,
  benchmarks: BenchmarkCacheService,
  detail: ListingDetail,
): Promise<BenchmarkValue | null> {
  for (const cohort of cohortCandidates(detail)) {
    try {
      const benchmark = await benchmarks.getOrLoad('auto-ria', cohort, () =>
        source.averagePrice(cohort),
      );
      if (benchmark.value.amount > 0 && benchmark.sampleSize >= MIN_USEFUL_SAMPLES) {
        return benchmark;
      }
    } catch (err) {
      if (err instanceof RateBudgetExhaustedError) throw err;
      // thin cohort (e.g. "Not Enough Data") → try the next, wider one
    }
  }
  return null;
}
