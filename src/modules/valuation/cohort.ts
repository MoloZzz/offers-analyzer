import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { CohortQuery, ListingDetail, ListingSource } from '../sources/ports/listing-source.port';

import { BenchmarkCacheService, BenchmarkValue } from './benchmark-cache.service';

/** A cohort's average is only trustworthy with at least this many comparable listings. */
const MIN_USEFUL_SAMPLES = 10;

/**
 * Cohorts to try, from a reasonable segment to the widest — widest-DATA fallback.
 * We deliberately drop city and mileage from the default: narrow cohorts (make+model+city+exact
 * year+mileage) collapse the sample to ~1, which the confidence gate then rejects (see
 * research/why-no-opportunities). Year±1 nationwide usually has hundreds of comparables.
 * (Mileage-adjusted valuation is a later refinement.)
 */
export function cohortCandidates(d: ListingDetail): CohortQuery[] {
  return [
    { markId: d.markId, modelId: d.modelId, yearFrom: d.year - 1, yearTo: d.year + 1 },
    { markId: d.markId, modelId: d.modelId },
  ];
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
