import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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
  private readonly apiKey: string;
  private readonly logResponses: boolean;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly budget: RateBudgetService,
    @InjectPinoLogger(AutoRiaSource.name) private readonly logger: PinoLogger,
  ) {
    this.apiKey = config.get('autoRiaApiKey', { infer: true });
    this.logResponses = config.get('logSourceRequests', { infer: true });
  }

  async search(query: SourceSearchQuery): Promise<SourceSearchResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      category_id: String(query.categoryId),
      countpage: '100', // max ids per request (default is small); we still dedup + budget info calls
    });
    if (query.stateId != null) params.set('state_id', String(query.stateId));
    if (query.cityId != null) params.set('city_id', String(query.cityId));
    if (query.priceFrom != null) params.set('price_ot', String(query.priceFrom));
    if (query.priceTo != null) params.set('price_do', String(query.priceTo));
    if (query.yearFrom != null) params.set('s_yers', String(query.yearFrom));
    if (query.yearTo != null) params.set('po_yers', String(query.yearTo));
    // "Newest by market": restrict to recently-submitted listings (AUTO.RIA `top` period code).
    if (query.submittedWithin != null) params.set('top', String(query.submittedWithin));
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
    const bar = d.autoInfoBar ?? {};
    const ad = d.autoData ?? {};

    return {
      externalId,
      make: d.markName ?? '',
      model: d.modelName ?? '',
      markId: d.markId ?? 0,
      modelId: d.modelId ?? 0,
      year: ad.year ?? 0,
      mileage: ad.raceInt ?? undefined,
      stateId: d.stateData?.stateId ?? undefined,
      cityId: d.stateData?.cityId ?? undefined,
      sellerType: mapSellerType(d.dealer),
      vin: d.VIN ?? undefined,
      hasVinReport: d.haveInfotechReport === true,
      url: d.linkToView
        ? `https://auto.ria.com${d.linkToView}`
        : `https://auto.ria.com/uk/auto_${externalId}.html`,
      price: { amount: d.USD ?? 0, currency: Currency.USD },
      risk: {
        damaged: bar.damage === true,
        salvage: bar.onRepairParts === true,
        unclearCustoms: bar.custom === true,
        confiscated: bar.confiscatedCar === true,
        underCredit: bar.underCredit === true,
        abroad: bar.abroad === true,
        vinChecked: d.checkedVin?.isChecked === true,
      },
      description: ad.description ?? undefined,
      gearbox: ad.gearboxName ?? undefined,
      fuel: ad.fuelName ?? undefined,
      engine: ad.modificationName ?? undefined,
      drive: ad.driveName ?? undefined,
      bodyId: ad.bodyId ?? undefined,
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
    // Prefer a robust central measure over the plain mean, which is skewed by outliers
    // (a live sample had arithmeticMean 12815 vs interQuartileMean 10584). See research note.
    const central = d.interQuartileMean ?? d.percentiles?.['50.0'] ?? d.arithmeticMean;
    // Guard: only a finite number may become a benchmark (Postgres numeric would store NaN otherwise).
    const amount = isFiniteNumber(central) ? central : 0;
    const sampleSize = isFiniteNumber(d.total) ? d.total : (d.prices?.length ?? 0);
    return {
      value: { amount, currency: Currency.USD },
      sampleSize,
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
      if (statusCode === 429) {
        // The source's own rate limit is authoritative — stop spending until the window rolls over.
        await this.budget.markExhausted(this.key);
        throw new RateBudgetExhaustedError(`AUTO.RIA ${path} rate limited (HTTP 429)`);
      }
      if (statusCode >= 400) {
        throw new SourceUnavailableError(`AUTO.RIA ${path} returned HTTP ${statusCode}`);
      }
      const json = (await body.json()) as T;
      if (this.logResponses) {
        const safe = new URLSearchParams(params);
        safe.set('api_key', '***');
        this.logger.debug({ path, params: safe.toString(), response: json }, 'AUTO.RIA request');
      }
      return json;
    } catch (err) {
      if (err instanceof SourceUnavailableError || err instanceof RateBudgetExhaustedError) {
        throw err;
      }
      this.logger.error({ err, path }, 'AUTO.RIA request failed');
      throw new SourceUnavailableError(`AUTO.RIA ${path} request failed`);
    }
  }
}

/** AUTO.RIA `/info` returns a `dealer` object; a private seller has `dealer.id === 0`. */
function mapSellerType(dealer?: { id?: number }): SellerType {
  if (!dealer) return 'unknown';
  return (dealer.id ?? 0) > 0 ? 'dealer' : 'private';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Real AUTO.RIA JSON shapes we read (verified against live responses). */
interface AutoRiaInfo {
  USD?: number;
  markId?: number;
  modelId?: number;
  markName?: string;
  modelName?: string;
  VIN?: string;
  haveInfotechReport?: boolean;
  checkedVin?: { isChecked?: boolean };
  linkToView?: string;
  dealer?: { id?: number };
  stateData?: { stateId?: number; cityId?: number };
  autoData?: {
    year?: number;
    raceInt?: number;
    description?: string;
    fuelNameEng?: string;
    fuelName?: string;
    fuelId?: number;
    driveName?: string;
    generationName?: string;
    categoryNameEng?: string;
    categoryId?: number;
    modificationId?: number;
    custom?: number;
    gearboxName?: string;
    subCategoryNameEng?: string;
    version?: string;
    gearBoxId?: number;
    race?: string;
    statusId?: number;
    vat?: boolean;
    modificationName?: string;
    generationId?: number;
    bodyId?: number;
    active?: boolean;
    driveId?: number;
    equipmentName?: string;
    mainCurrency?: string;
    withVideoMessages?: boolean;
    autoId?: number;
    onModeration?: boolean;
  };
  autoInfoBar?: {
    abroad?: boolean;
    confiscatedCar?: boolean;
    custom?: boolean;
    damage?: boolean;
    onRepairParts?: boolean;
    underCredit?: boolean;
  };
}

interface AutoRiaAverage {
  arithmeticMean?: number;
  interQuartileMean?: number;
  percentiles?: Record<string, number>;
  total?: number;
  prices?: number[];
}
