/**
 * Pure decision functions for realized-price calibration (SPEC-004, US4.1–4.2). No DI, no side
 * effects, no source dependency — the zero-API guarantee is structural (FR-409). The service
 * layer (Slice C) wires these against repositories; this module only decides.
 */
import { Currency } from '../../common/types/money';
import { normalizeVin } from '../notifications/vin';
import { SearchProfile } from '../profiles/entities/search-profile.entity';
import { CohortQuery, SourceSearchResult } from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { MILEAGE_BAND_K } from '../valuation/cohort';

import { Listing } from './entities/listing.entity';

/** Absence grace period before a still-active listing becomes a disappearance candidate (FR-403). */
export const GRACE_HOURS = 24;
/** Relist identity-match lookback window (FR-407). */
export const RELIST_WINDOW_DAYS = 30;
/** Relist mileage tolerance, in thousand km (same unit as `Listing.mileage`). */
export const RELIST_MILEAGE_TOLERANCE_K = 2;

/**
 * FR-402: a profile-cycle is eligible detection evidence only when the profile has no
 * `submittedWithin` window (which would otherwise age listings out with no relation to a sale)
 * AND the search result is complete (not paging-truncated).
 */
export function isSearchEligible(profile: SearchProfile, result: SourceSearchResult): boolean {
  if (profile.filters.submittedWithin != null) return false;
  if (result.total != null) return result.total <= result.ids.length;
  return result.ids.length < 100;
}

/** The subset of `Listing` fields needed to judge whether a profile's search still matches it. */
export type CoverageListing = Pick<
  Listing,
  | 'stateId'
  | 'cityId'
  | 'markId'
  | 'modelId'
  | 'year'
  | 'mileage'
  | 'currentAmount'
  | 'currentCurrency'
  | 'sellerType'
  | 'make'
  | 'model'
>;

/**
 * FR-403: would `profile`'s search still match `listing`, judged from stored attributes? Mirrors
 * `toQuery`/`isExcluded` (poll.service.ts) semantics. Conservative on missing data: whenever a
 * listing attribute needed by an *active* filter is null/undefined, the listing is treated as
 * NOT covered (a wrongly-uncovered listing just never becomes a candidate — see plan.md
 * §Complexity/risk).
 */
export function profileCovers(profile: SearchProfile, listing: CoverageListing): boolean {
  if (profile.stateId != null && listing.stateId !== profile.stateId) return false;
  if (profile.cityId != null && listing.cityId !== profile.cityId) return false;

  // Empty makeModelPairs = market-wide (matches all makes), per ProfileFilters doc-comment.
  const pairs = profile.filters.makeModelPairs;
  if (pairs.length > 0) {
    if (listing.markId == null || listing.modelId == null) return false;
    const matches = pairs.some((p) => p.markId === listing.markId && p.modelId === listing.modelId);
    if (!matches) return false;
  }

  if (profile.filters.yearFrom != null && listing.year < profile.filters.yearFrom) return false;
  if (profile.filters.yearTo != null && listing.year > profile.filters.yearTo) return false;

  // Profile price bounds are compared in USD; a non-USD listing can't be judged without an FX
  // conversion this pure function doesn't have — conservative: not covered.
  if (profile.priceFrom != null || profile.priceTo != null) {
    if (listing.currentCurrency !== Currency.USD) return false;
    if (profile.priceFrom != null && listing.currentAmount < profile.priceFrom) return false;
    if (profile.priceTo != null && listing.currentAmount > profile.priceTo) return false;
  }

  if (profile.filters.mileageFrom != null || profile.filters.mileageTo != null) {
    if (listing.mileage == null) return false;
    if (profile.filters.mileageFrom != null && listing.mileage < profile.filters.mileageFrom) return false;
    if (profile.filters.mileageTo != null && listing.mileage > profile.filters.mileageTo) return false;
  }

  const exclude = profile.filters.excludeMakeModels;
  if (exclude && exclude.length > 0) {
    const makeModel = `${listing.make} ${listing.model}`.toLowerCase();
    if (exclude.some((e) => makeModel.includes(e.toLowerCase()))) return false;
  }

  if (profile.dealerPolicy === 'exclude' && listing.sellerType === 'dealer') return false;

  return true;
}

export interface PriceCutStats {
  priceCutsCount: number;
  hadPriceCut: boolean;
}

/** A single price observation used for the price-cut derivation (FR-404). */
export interface PriceObservationPoint {
  amountUsd: number;
  observedAt: Date;
}

/**
 * FR-404: `priceCutsCount` = number of strictly-decreasing consecutive steps, sorted by time;
 * `hadPriceCut` = any later observation strictly cheaper than the first. Empty/single-element
 * history → zeros/false (no evidence of a cut).
 */
export function priceCutStats(observations: PriceObservationPoint[]): PriceCutStats {
  if (observations.length < 2) return { priceCutsCount: 0, hadPriceCut: false };
  const sorted = [...observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  let priceCutsCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].amountUsd < sorted[i - 1].amountUsd) priceCutsCount++;
  }
  const first = sorted[0].amountUsd;
  const hadPriceCut = sorted.slice(1).some((o) => o.amountUsd < first);

  return { priceCutsCount, hadPriceCut };
}

/** FR-404: days on market, rounded, never negative. */
export function domDays(firstSeenAt: Date, disappearedAt: Date): number {
  const days = Math.round((disappearedAt.getTime() - firstSeenAt.getTime()) / 86_400_000);
  return Math.max(0, days);
}

/** The subset of `Listing` fields needed to compute the calibration cohort key. */
export type CohortListing = Pick<Listing, 'markId' | 'modelId' | 'year' | 'mileage'>;

/**
 * FR-404: banded cohort key, same format as `BenchmarkCacheService.cohortKey` (so US4.3 joins
 * against `average_price_snapshots` for free) — mirrors the most-specific candidate in
 * `cohort.ts`'s `cohortCandidates` (year±1, mileage±`MILEAGE_BAND_K`). No `cityId` (cohort.ts
 * never constrains by city). Null when `markId`/`modelId` is missing — a cohort key needs both.
 */
export function cohortKeyForListing(listing: CohortListing): string | null {
  if (listing.markId == null || listing.modelId == null) return null;

  const cohort: CohortQuery = {
    markId: listing.markId,
    modelId: listing.modelId,
    yearFrom: listing.year - 1,
    yearTo: listing.year + 1,
  };
  if (listing.mileage != null && listing.mileage > 0) {
    cohort.mileageFrom = Math.max(0, listing.mileage - MILEAGE_BAND_K);
    cohort.mileageTo = listing.mileage + MILEAGE_BAND_K;
  }

  return BenchmarkCacheService.cohortKey(cohort);
}

/** The subset of listing identity fields needed for relist matching (FR-407). */
export interface RelistCandidate {
  vin?: string | null;
  markId?: number | null;
  modelId?: number | null;
  year?: number | null;
  cityId?: number | null;
  mileage?: number | null;
}

/**
 * FR-407: `prev` (the disappeared listing) and `next` (a newly ingested listing) are the same
 * car iff either (a) both VINs normalize to non-empty and equal, or (b) markId+modelId+year+
 * cityId all present-and-equal on both AND both mileages present within
 * `RELIST_MILEAGE_TOLERANCE_K` (thousand km) of each other.
 */
export function isRelistMatch(prev: RelistCandidate, next: RelistCandidate): boolean {
  const prevVin = normalizeVin(prev.vin);
  const nextVin = normalizeVin(next.vin);
  if (prevVin && nextVin && prevVin === nextVin) return true;

  if (
    prev.markId != null &&
    next.markId != null &&
    prev.markId === next.markId &&
    prev.modelId != null &&
    next.modelId != null &&
    prev.modelId === next.modelId &&
    prev.year != null &&
    next.year != null &&
    prev.year === next.year &&
    prev.cityId != null &&
    next.cityId != null &&
    prev.cityId === next.cityId &&
    prev.mileage != null &&
    next.mileage != null &&
    Math.abs(prev.mileage - next.mileage) <= RELIST_MILEAGE_TOLERANCE_K
  ) {
    return true;
  }

  return false;
}
