import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'undici';

import { AppConfig } from '../../../common/config/configuration';
import {
  RateBudgetExhaustedError,
  SourceUnavailableError,
} from '../../../common/errors/domain-error';
import { Currency } from '../../../common/types/money';
import { RateBudgetService } from '../../scheduling/rate-budget.service';
import {
  AveragePriceResult,
  CohortQuery,
  ListingDetail,
  ListingSource,
  SellerType,
  SourceDictionaries,
  SourceSearchQuery,
  SourceSearchResult,
} from '../ports/listing-source.port';

const BASE_URL = 'https://developers.ria.com/auto';

/**
 * AUTO.RIA official API adapter (the first ListingSource). Every call is gated by the shared
 * rate budget (constitution §V). Field mappings follow the documented API and are validated
 * against recorded fixtures — see contracts/auto-ria-api.md and research.md (open items).
 */
@Injectable()
export class AutoRiaSource implements ListingSource {
  readonly key = 'auto-ria';
  private readonly logger = new Logger(AutoRiaSource.name);
  private readonly apiKey: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly budget: RateBudgetService,
  ) {
    this.apiKey = config.get('autoRiaApiKey', { infer: true });
  }

  async search(query: SourceSearchQuery): Promise<SourceSearchResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      category_id: String(query.categoryId),
    });
    if (query.stateId != null) params.set('state_id', String(query.stateId));
    if (query.cityId != null) params.set('city_id', String(query.cityId));
    if (query.priceFrom != null) params.set('price_ot', String(query.priceFrom));
    if (query.priceTo != null) params.set('price_do', String(query.priceTo));
    if (query.yearFrom != null) params.set('s_yers', String(query.yearFrom));
    if (query.yearTo != null) params.set('po_yers', String(query.yearTo));
    if (query.page != null) params.set('page', String(query.page));
    for (const { markId, modelId } of query.makeModelPairs) {
      params.append('marka_id[]', String(markId));
      params.append('model_id[]', String(modelId));
    }

    const data = await this.get<{ result?: { search_result?: { ids?: string[] } } }>(
      '/search',
      params,
    );
    return { ids: data.result?.search_result?.ids ?? [] };
  }

  async fetch(externalId: string): Promise<ListingDetail> {
    const params = new URLSearchParams({ api_key: this.apiKey, auto_id: externalId });
    const d = await this.get<AutoRiaInfo>('/info', params);

    const currency = Currency.USD;
    const amount = d.USD ?? d.price ?? 0;
    return {
      externalId,
      make: d.markName ?? '',
      model: d.modelName ?? '',
      markId: d.marka_id ?? 0,
      modelId: d.model_id ?? 0,
      year: d.autoData?.year ?? d.year ?? 0,
      mileage: parseMileage(d.autoData?.race),
      stateId: d.stateId ?? undefined,
      cityId: d.cityId ?? undefined,
      sellerType: mapSellerType(d.dealer),
      vin: d.VIN ?? undefined,
      vinReportUrl: d.linkToReport ?? undefined,
      url: d.linkToView ?? `https://auto.ria.com/uk/auto_${externalId}.html`,
      price: { amount, currency },
    };
  }

  async averagePrice(cohort: CohortQuery): Promise<AveragePriceResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      marka_id: String(cohort.markId),
      model_id: String(cohort.modelId),
    });
    if (cohort.cityId != null) params.set('city_id', String(cohort.cityId));
    if (cohort.yearFrom != null) params.append('yers', String(cohort.yearFrom));
    if (cohort.yearTo != null) params.append('yers', String(cohort.yearTo));
    if (cohort.mileageFrom != null) params.append('raceInt', String(cohort.mileageFrom));
    if (cohort.mileageTo != null) params.append('raceInt', String(cohort.mileageTo));

    const d = await this.get<AutoRiaAverage>('/average_price', params);
    return {
      value: { amount: d.arithmeticMean ?? 0, currency: Currency.USD },
      sampleSize: d.total ?? d.prices?.length ?? 0,
    };
  }

  async dictionaries(): Promise<SourceDictionaries> {
    // Not on the US1 hot path (profiles carry ids, info carries names). Left minimal for now.
    return { marks: {}, models: {}, states: {}, cities: {} };
  }

  private async get<T>(path: string, params: URLSearchParams): Promise<T> {
    const allowed = await this.budget.tryConsume(this.key);
    if (!allowed) {
      throw new RateBudgetExhaustedError(`AUTO.RIA request budget exhausted for ${path}`);
    }
    const url = `${BASE_URL}${path}?${params.toString()}`;
    try {
      const { statusCode, body } = await request(url);
      if (statusCode >= 400) {
        throw new SourceUnavailableError(`AUTO.RIA ${path} returned HTTP ${statusCode}`);
      }
      return (await body.json()) as T;
    } catch (err) {
      if (err instanceof SourceUnavailableError) throw err;
      this.logger.error(`AUTO.RIA ${path} request failed`, err as Error);
      throw new SourceUnavailableError(`AUTO.RIA ${path} request failed`);
    }
  }
}

function mapSellerType(dealer: unknown): SellerType {
  if (dealer === true || dealer === 1) return 'dealer';
  if (dealer === false || dealer === 0) return 'private';
  return 'unknown';
}

function parseMileage(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
    const match = normalized.match(/([\d,.]+)/);
    if (!match) return undefined;

    let num = Number(match[1].replace(',', '.'));
    if (Number.isNaN(num)) return undefined;

    if (normalized.includes('тис')) {
      num *= 1000;
    }

    return Math.round(num);
  }

  return undefined;
}

/** Loose shapes for the AUTO.RIA JSON we read; validated against fixtures in contract tests. */
interface AutoRiaInfo {
  USD?: number;
  price?: number;
  markName?: string;
  modelName?: string;
  marka_id?: number;
  model_id?: number;
  year?: number;
  stateId?: number;
  cityId?: number;
  dealer?: boolean | number;
  VIN?: string;
  linkToReport?: string;
  linkToView?: string;
  autoData?: { year?: number; race?: number };
}

interface AutoRiaAverage {
  arithmeticMean?: number;
  total?: number;
  prices?: number[];
}
