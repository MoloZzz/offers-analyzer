import { Money } from '../../../common/types/money';
import type { BudgetRequestContext } from '../../scheduling/rate-budget.service';

import {
  ProviderFact,
  ProviderLocation,
  ProviderVehicleFacts,
  ProviderVinEvidence,
  sourceProviderFact,
  unavailableProviderFact,
} from './valuation-provider.port';

/** DI token for the active listing source (constitution §IV: ports & adapters). */
export const LISTING_SOURCE = Symbol('LISTING_SOURCE');

export type SellerType = 'private' | 'dealer' | 'unknown';

export interface SourceSearchQuery {
  categoryId: number;
  stateId?: number;
  cityId?: number;
  makeModelPairs: Array<{ markId: number; modelId: number }>;
  yearFrom?: number;
  yearTo?: number;
  priceFrom?: number;
  priceTo?: number;
  mileageFrom?: number;
  mileageTo?: number;
  page?: number;
  /**
   * Restrict to listings submitted within a recent window ("newest by market"). AUTO.RIA `top`
   * (period): 1=last hour, 2=today, 3=3 days, 4=week, 5=month, 8=last 3h, 9=last 6h. Undefined = all.
   */
  submittedWithin?: number;
}

export interface SourceSearchResult {
  ids: string[];
  nextPage?: string;
  /** Total match count reported by the source; used to detect truncated result pages. */
  total?: number;
}

/** Risk signals read from the source (AUTO.RIA `autoInfoBar`). Drive red-flags. */
export interface ListingRisk {
  damaged: boolean;
  salvage: boolean;
  unclearCustoms: boolean;
  confiscated: boolean;
  underCredit: boolean;
  abroad: boolean;
  vinChecked: boolean;
}

export interface ListingDetail {
  externalId: string;
  make: string;
  model: string;
  markId: number;
  modelId: number;
  /** Source category needed by AUTO.RIA AI attributes-mode request. */
  categoryId?: number;
  year: number;
  /** Mileage in thousand km (AUTO.RIA `raceInt`). */
  mileage?: number;
  stateId?: number;
  cityId?: number;
  sellerType: SellerType;
  vin?: string;
  hasVinReport: boolean;
  url: string;
  price: Money;
  risk: ListingRisk;
  /** Free-text seller description (AUTO.RIA `autoData.description`) — scanned for condition signals. */
  description?: string;
  /** Transmission type (AUTO.RIA `autoData.gearboxName` / `gearBoxId`). */
  gearbox?: string;
  gearboxId?: number;
  /** Fuel type (AUTO.RIA `autoData.fuelName` / `fuelId`). */
  fuel?: string;
  fuelId?: number;
  /** Engine/modification info (AUTO.RIA `autoData.modificationName` / `modificationId`). */
  engine?: string;
  /** Provider-compatible modification name; `engine` remains the legacy repair-risk input. */
  modification?: string;
  modificationId?: number;
  generation?: string;
  generationId?: number;
  /** Drive type (AUTO.RIA `autoData.driveName` / `driveId`). */
  drive?: string;
  driveId?: number;
  /** Body type id (AUTO.RIA `autoData.bodyId`). */
  bodyId?: number;
  body?: string;
  stateName?: string;
  cityName?: string;
  /** Explicit source-provided VIN evidence state; absent means the source did not expose it. */
  vinEvidence?: ProviderVinEvidence;
}

/**
 * Preserve source identity/availability without changing the legacy scoring inputs. Description
 * text is intentionally omitted: condition signals are local evidence and are never copied into
 * an external request by this source mapper.
 */
export function toProviderVehicleFacts(detail: ListingDetail): ProviderVehicleFacts {
  return {
    // Legacy ListingDetail uses `0` as the historical missing-ID/year sentinel. Never promote
    // that sentinel into a provider-available fact or an attributes-mode request.
    categoryId: sourceFact(detail.categoryId, { positiveNumber: true }),
    make: sourceFact(detail.make),
    model: sourceFact(detail.model),
    markId: sourceFact(detail.markId, { positiveNumber: true }),
    modelId: sourceFact(detail.modelId, { positiveNumber: true }),
    year: sourceFact(detail.year, { positiveNumber: true }),
    generationId: sourceFact(detail.generationId, { positiveNumber: true }),
    generationName: sourceFact(detail.generation),
    modificationId: sourceFact(detail.modificationId, { positiveNumber: true }),
    modificationName: sourceFact(detail.modification),
    bodyId: sourceFact(detail.bodyId, { positiveNumber: true }),
    bodyName: sourceFact(detail.body),
    fuelId: sourceFact(detail.fuelId, { positiveNumber: true }),
    fuelName: sourceFact(detail.fuel),
    gearboxId: sourceFact(detail.gearboxId, { positiveNumber: true }),
    gearboxName: sourceFact(detail.gearbox),
    driveId: sourceFact(detail.driveId, { positiveNumber: true }),
    driveName: sourceFact(detail.drive),
    mileageK: sourceFact(detail.mileage),
    location: sourceLocationFact(detail),
    vinEvidence: sourceFact(detail.vinEvidence),
    conditionEvidence: unavailableProviderFact(),
  };
}

function sourceFact<T extends string | number | ProviderVinEvidence>(
  value: T | undefined,
  options: { positiveNumber?: boolean } = {},
): ProviderFact<T> {
  if (typeof value === 'string') {
    return value.trim() === '' ? unavailableProviderFact() : sourceProviderFact(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && (!options.positiveNumber || value > 0)
      ? sourceProviderFact(value)
      : unavailableProviderFact();
  }
  return value == null ? unavailableProviderFact() : sourceProviderFact(value);
}

function sourceLocationFact(detail: ListingDetail): ProviderFact<ProviderLocation> {
  const location: ProviderLocation = {
    stateId: isPositiveInteger(detail.stateId) ? detail.stateId : undefined,
    cityId: isPositiveInteger(detail.cityId) ? detail.cityId : undefined,
    stateName: detail.stateName,
    cityName: detail.cityName,
  };
  const hasLocation = Object.values(location).some((value) => value != null && value !== '');
  return hasLocation ? sourceProviderFact(location) : unavailableProviderFact();
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export interface CohortQuery {
  markId: number;
  modelId: number;
  cityId?: number;
  yearFrom?: number;
  yearTo?: number;
  mileageFrom?: number;
  mileageTo?: number;
}

export interface AveragePriceResult {
  value: Money;
  sampleSize: number;
}

export interface SourceDictionaries {
  marks: Record<number, string>;
  models: Record<number, string>;
  states: Record<number, string>;
  cities: Record<number, string>;
}

/**
 * A source of car listings. AUTO.RIA is the first adapter; other sites implement the same port.
 * Every call MUST go through the shared rate budget — adapters never bypass it.
 * ADR-0009: fetch() and averagePrice() accept optional tier parameter (1-5) for priority queue.
 */
export interface ListingSource {
  readonly key: string;
  search(query: SourceSearchQuery, context?: BudgetRequestContext): Promise<SourceSearchResult>;
  fetch(externalId: string, tier?: number, context?: BudgetRequestContext): Promise<ListingDetail>;
  averagePrice(
    cohort: CohortQuery,
    tier?: number,
    context?: BudgetRequestContext,
  ): Promise<AveragePriceResult>;
  dictionaries(): Promise<SourceDictionaries>;
}
