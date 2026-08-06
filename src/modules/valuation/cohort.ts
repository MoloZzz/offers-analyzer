import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { CohortQuery, ListingDetail, ListingSource } from '../sources/ports/listing-source.port';

import { BenchmarkCacheService, BenchmarkValue } from './benchmark-cache.service';

/** A cohort's average is only trustworthy with at least this many comparable listings. */
const MIN_USEFUL_SAMPLES = 10;

/** Half-width of the mileage band (thousand km) around the listing's own mileage — see M1 (banded). */
export const MILEAGE_BAND_K = 25;

/**
 * Cohorts to try, from the most specific to the widest — widest-DATA fallback. `resolveBenchmark`
 * walks these until one has enough samples.
 *
 * - **Mileage-banded** (make+model+year±1+mileage±25k km) — a true like-for-like average, so a
 *   high-mileage car isn't judged against low-mileage comparables. Only kept when we know mileage.
 * - **Exact year + drivetrain** (make+model+year+gearbox+fuel) — the tightest cohort the endpoint
 *   can express. See the note on trim and generation below.
 * - **Year±1 + drivetrain** — same band, one generation-boundary year either side, so it survives
 *   models where a single year is too thin.
 * - **Year±1 nationwide** (drop the band) — the unblocker: narrow cohorts (make+model+city+exact
 *   year+mileage) collapse the sample to ~1 and the confidence gate rejects everything (see
 *   research/why-no-opportunities). This usually has hundreds of comparables.
 * - **Make+model only** — last resort so we still produce *some* benchmark.
 *
 * **On trim and generation.** `/average_price` accepts no generation or modification parameter — its
 * whole filter set is year, mileage, city, gearbox, fuel and equipment options (the AI endpoint that
 * does take `generationId`/`modificationId` is a separate, paid, shadow-only path, ADR-0017). So
 * *gearbox + fuel* stand in for trim — within one model-year they are what actually splits the
 * price, since a diesel manual and a petrol automatic are different cars to a buyer — and an exact
 * year stands in for generation, being the only lever the endpoint offers on that axis. Both are
 * proxies, and the ladder treats them as such: a thin proxy cohort falls through to the wide one
 * rather than producing a confident average over three comparables.
 *
 * City is deliberately never used (it starves the sample). When we fall back off the banded cohort,
 * an analytic mileage correction compensates (M2), and it may only lower fair value (ADR-0023).
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
  // `year` uses 0 as the historical missing-value sentinel; a band around it would spend two extra
  // requests on a nonsense year range.
  const band = d.year > 0 ? drivetrainBand(d) : null;
  if (band) {
    candidates.push({ ...base, ...band, yearFrom: d.year, yearTo: d.year });
    candidates.push({ ...base, ...band, yearFrom: d.year - 1, yearTo: d.year + 1 });
  }
  candidates.push({ ...base, yearFrom: d.year - 1, yearTo: d.year + 1 });
  candidates.push(base);
  return candidates;
}

/**
 * The gearbox/fuel pair to narrow by, or null when the source gave us neither. Either one alone is
 * still a real narrowing, so both are optional — but a band of nothing is not a tier, it is a
 * duplicate of the cohort below it, and duplicates cost requests.
 */
function drivetrainBand(d: ListingDetail): { gearboxId?: number; fuelId?: number } | null {
  const band: { gearboxId?: number; fuelId?: number } = {};
  if (isPositiveId(d.gearboxId)) band.gearboxId = d.gearboxId;
  if (isPositiveId(d.fuelId)) band.fuelId = d.fuelId;
  return band.gearboxId == null && band.fuelId == null ? null : band;
}

function isPositiveId(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** A resolved benchmark plus whether its cohort was mileage-banded (M2 skips correction if so). */
export interface ResolvedBenchmark extends BenchmarkValue {
  mileageAware: boolean;
  cohort: {
    key: string;
    tier: string;
  };
}

/**
 * Resolve a usable benchmark, widening the cohort until it has enough samples. Returns null when
 * even the widest cohort has no usable data. A budget-exhausted error propagates (stops the cycle).
 * `mileageAware` is true when the matched cohort was constrained by mileage (like-for-like).
 */
export async function resolveBenchmark(
  source: ListingSource,
  benchmarks: BenchmarkCacheService,
  detail: ListingDetail,
): Promise<ResolvedBenchmark | null> {
  // Start with cohorts reusable across many incoming listings. A live mileage band is
  // commonly unique to one car and defeats the 24-hour cache; mileage is still adjusted
  // analytically downstream when the selected benchmark is not mileage-aware (SPEC-010).
  // The drivetrain-banded tiers are kept: a gearbox/fuel pair is shared by a whole slice of the
  // market, so unlike a mileage band it is reused rather than being one car's fingerprint.
  const candidates = cohortCandidates(detail).filter((cohort) => cohort.mileageFrom == null);
  for (const cohort of candidates) {
    try {
      const benchmark = await benchmarks.getOrLoad('auto-ria', cohort, () =>
        source.averagePrice(cohort, 5), // Tier-5: cohort averages (ADR-0009, lowest priority)
      );
      if (benchmark.value.amount > 0 && benchmark.sampleSize >= MIN_USEFUL_SAMPLES) {
        return {
          ...benchmark,
          mileageAware: cohort.mileageFrom != null,
          cohort: {
            key: cohortKey(cohort),
            tier: cohortTier(cohort),
          },
        };
      }
    } catch (err) {
      if (err instanceof RateBudgetExhaustedError) throw err;
      // thin cohort (e.g. "Not Enough Data") → try the next, wider one
    }
  }
  return null;
}

/**
 * Names the matched tier for `/why` and for the assessment-confidence coverage table (whose keys
 * mirror these). Derived from the cohort's own shape, so a new candidate cannot silently inherit a
 * neighbour's label. The bare make+model cohort keeps its historical `make_model_fallback` name —
 * it is always reached by falling back, and persisted explanations already carry that string.
 */
function cohortTier(cohort: CohortQuery): string {
  if (cohort.mileageFrom != null) return 'make_model_year_mileage';
  const banded = cohort.gearboxId != null || cohort.fuelId != null;
  if (cohort.yearFrom != null || cohort.yearTo != null) {
    if (!banded) return 'make_model_year';
    return cohort.yearFrom === cohort.yearTo
      ? 'make_model_year_exact_trim'
      : 'make_model_year_trim';
  }
  return 'make_model_fallback';
}

function cohortKey(cohort: CohortQuery): string {
  return [
    `mark:${cohort.markId}`,
    `model:${cohort.modelId}`,
    cohort.yearFrom != null || cohort.yearTo != null
      ? `year:${cohort.yearFrom ?? '*'}-${cohort.yearTo ?? '*'}`
      : null,
    cohort.mileageFrom != null || cohort.mileageTo != null
      ? `mileage:${cohort.mileageFrom ?? '*'}-${cohort.mileageTo ?? '*'}`
      : null,
    cohort.gearboxId != null ? `gear:${cohort.gearboxId}` : null,
    cohort.fuelId != null ? `fuel:${cohort.fuelId}` : null,
  ]
    .filter(Boolean)
    .join('|');
}
