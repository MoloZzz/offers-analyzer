import { Money } from '../../../common/types/money';

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
}

export interface SourceSearchResult {
  ids: string[];
  nextPage?: string;
}

export interface ListingDetail {
  externalId: string;
  make: string;
  model: string;
  markId: number;
  modelId: number;
  year: number;
  mileage?: number;
  stateId?: number;
  cityId?: number;
  sellerType: SellerType;
  vin?: string;
  vinReportUrl?: string;
  url: string;
  price: Money;
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
 */
export interface ListingSource {
  readonly key: string;
  search(query: SourceSearchQuery): Promise<SourceSearchResult>;
  fetch(externalId: string): Promise<ListingDetail>;
  averagePrice(cohort: CohortQuery): Promise<AveragePriceResult>;
  dictionaries(): Promise<SourceDictionaries>;
}
