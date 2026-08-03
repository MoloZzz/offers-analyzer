import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { request } from 'undici';

import { AppConfig } from '../../../common/config/configuration';
import { Currency } from '../../../common/types/money';
import {
  ACTIVE_LISTING_ASK_TARGET,
  AUTO_RIA_AI_PROVIDER_KEY,
  ProviderChargeStatus,
  ProviderComparableProjection,
  ProviderComparableSummary,
  ProviderFailureCode,
  ProviderMarketEstimate,
  ProviderRequestProjection,
  ProviderStatisticProjection,
  ProviderStatistics,
  ProviderValuationOutcome,
  ProviderValuationRequest,
  ProviderVehicleFacts,
  ValuationProvider,
} from '../ports/valuation-provider.port';

const BASE_URL = 'https://developers.ria.com';
export const AUTO_RIA_AI_ENDPOINT_PATH = '/auto/ai-avarage-price/';
export const AUTO_RIA_AI_ADAPTER_VERSION = 'auto-ria-ai-v1';
const MAX_RETAINED_COMPARABLES = 20;

type NormalizationResult =
  | {
      kind: 'available';
      estimate: ProviderMarketEstimate;
      statistics: ProviderStatistics;
      comparableSummary: ProviderComparableSummary;
      responseFingerprint: string;
    }
  | { kind: 'unavailable'; failureCode: 'insufficient_data' | 'schema_invalid' };

type PriceParseResult =
  { kind: 'available'; value: ProviderMarketEstimate } | { kind: 'missing' } | { kind: 'invalid' };

/**
 * Official AUTO.RIA AI valuation adapter. It is intentionally isolated from persistence and
 * RateBudgetService: callers must obtain shared-budget admission before calling `valuate`.
 * With the default configuration it returns `not_configured` before constructing any request.
 */
@Injectable()
export class AutoRiaAiValuationProvider implements ValuationProvider {
  readonly key = AUTO_RIA_AI_PROVIDER_KEY;
  readonly adapterVersion = AUTO_RIA_AI_ADAPTER_VERSION;
  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(AutoRiaAiValuationProvider.name) private readonly logger: PinoLogger,
  ) {
    this.enabled = config.get('autoRiaAiEnabled', { infer: true });
    this.apiKey = config.get('autoRiaAiApiKey', { infer: true });
    this.userId = config.get('autoRiaAiUserId', { infer: true });
    this.timeoutMs = config.get('autoRiaAiTimeoutMs', { infer: true });
  }

  async valuate(requestInput: ProviderValuationRequest): Promise<ProviderValuationOutcome> {
    const requestProjection = buildRequestProjection(requestInput);
    const invalidInput = validateRequest(requestInput, this.adapterVersion);
    if (!this.isConfigured()) {
      return this.terminal(
        requestInput,
        requestProjection,
        'not_configured',
        'not_configured',
        false,
      );
    }
    if (invalidInput) {
      return this.terminal(requestInput, requestProjection, 'invalid_input', invalidInput, false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const credentials = new URLSearchParams({ api_key: this.apiKey, user_id: this.userId });
      const url = `${BASE_URL}${AUTO_RIA_AI_ENDPOINT_PATH}?${credentials.toString()}`;
      const { statusCode, body, headers } = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(requestProjection.body),
        signal: controller.signal,
      });
      const correlationId = safeCorrelationId(headers['x-request-id']);

      const httpFailure = mapHttpFailure(statusCode);
      if (httpFailure) {
        return this.terminal(
          requestInput,
          requestProjection,
          httpFailure.status,
          httpFailure.failureCode,
          httpFailure.retryable,
          'unknown',
          correlationId,
        );
      }

      let payload: unknown;
      try {
        payload = await body.json();
      } catch {
        return this.terminal(
          requestInput,
          requestProjection,
          'unavailable',
          'schema_invalid',
          false,
          'unknown',
          correlationId,
        );
      }

      const normalized = normalizeAutoRiaAiResponse(payload);
      if (normalized.kind === 'unavailable') {
        return this.terminal(
          requestInput,
          requestProjection,
          'unavailable',
          normalized.failureCode,
          false,
          'unknown',
          correlationId,
        );
      }

      return {
        ...this.outcomeBase(requestInput, requestProjection, correlationId),
        status: 'available',
        retryable: false,
        chargeStatus: 'unknown',
        // AUTO.RIA's response does not carry a stable source timestamp. Preserve the local
        // response-capture time as the as-of boundary for freshness/reproducibility instead of
        // leaving every valid result permanently unassessed.
        sourceCapturedAt: new Date(),
        estimate: normalized.estimate,
        statistics: normalized.statistics,
        comparableSummary: normalized.comparableSummary,
        responseFingerprint: normalized.responseFingerprint,
      };
    } catch (error: unknown) {
      // The controller is owned by this adapter, so an aborted signal is a bounded source timeout
      // even if a particular undici dispatcher surfaces a transport-specific error shape.
      const failureCode =
        controller.signal.aborted || isAbortError(error) ? 'timeout' : 'transport';
      this.logger.warn(
        { failureCode, queryMode: requestInput.queryMode },
        'AUTO.RIA AI valuation request failed',
      );
      return this.terminal(
        requestInput,
        requestProjection,
        'unavailable',
        failureCode,
        true,
        'unknown',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private isConfigured(): boolean {
    return this.enabled && this.apiKey.trim() !== '' && this.userId.trim() !== '';
  }

  private outcomeBase(
    requestInput: ProviderValuationRequest,
    requestProjection: ProviderRequestProjection,
    correlationId?: string,
  ): Omit<ProviderValuationOutcome, 'status' | 'retryable' | 'chargeStatus'> {
    return {
      providerKey: AUTO_RIA_AI_PROVIDER_KEY,
      target: ACTIVE_LISTING_ASK_TARGET,
      adapterVersion: this.adapterVersion,
      queryMode: requestInput.queryMode,
      requestProjection,
      providerMetadata: {
        adapterVersion: this.adapterVersion,
        queryMode: requestInput.queryMode,
        ...(correlationId ? { correlationId } : {}),
      },
    };
  }

  private terminal(
    requestInput: ProviderValuationRequest,
    requestProjection: ProviderRequestProjection,
    status: Exclude<ProviderValuationOutcome['status'], 'available'>,
    failureCode: ProviderFailureCode,
    retryable: boolean,
    chargeStatus: ProviderChargeStatus = 'not_applicable',
    correlationId?: string,
  ): ProviderValuationOutcome {
    return {
      ...this.outcomeBase(requestInput, requestProjection, correlationId),
      status,
      failureCode,
      retryable,
      chargeStatus,
    };
  }
}

/** Safe-to-store request projection. Credentials are query parameters and never appear here. */
export function buildRequestProjection(
  requestInput: ProviderValuationRequest,
): ProviderRequestProjection {
  const params =
    requestInput.queryMode === 'omni_id'
      ? { omniId: requestInput.sourceListingId ?? '' }
      : attributesParams(requestInput.normalizedFacts);
  return {
    endpointPath: AUTO_RIA_AI_ENDPOINT_PATH,
    method: 'POST',
    queryMode: requestInput.queryMode,
    body: {
      langId: requestInput.languageId,
      period: requestInput.period,
      params,
    },
  };
}

/**
 * Maps only API-documented attributes. Raw VIN/plate and seller description are deliberately
 * excluded even when present in the source response or local ListingDetail.
 */
function attributesParams(facts: ProviderVehicleFacts): Record<string, unknown> {
  const params: Record<string, unknown> = {
    categoryId: String(requiredNumber(facts.categoryId)),
    brandId: String(requiredNumber(facts.markId)),
    modelId: String(requiredNumber(facts.modelId)),
    year: exactRange(requiredNumber(facts.year)),
    mileage: exactRange(requiredNumber(facts.mileageK)),
  };
  addIdParam(params, 'stateId', facts.location, 'stateId');
  addIdParam(params, 'city_id', facts.location, 'cityId');
  addFactIdParam(params, 'generationId', facts.generationId);
  addFactIdParam(params, 'modificationId', facts.modificationId);
  addFactIdParam(params, 'bodyId', facts.bodyId);
  addFactIdParam(params, 'fuelId', facts.fuelId);
  addFactIdParam(params, 'gearBoxId', facts.gearboxId);
  addFactIdParam(params, 'driveId', facts.driveId);
  return params;
}

function addIdParam(
  target: Record<string, unknown>,
  name: string,
  location: ProviderVehicleFacts['location'],
  key: 'stateId' | 'cityId',
): void {
  if (location.availability !== 'available') return;
  const value = location.value[key];
  if (isPositiveInteger(value)) target[name] = String(value);
}

function addFactIdParam(
  target: Record<string, unknown>,
  name: string,
  fact: ProviderVehicleFacts['generationId'],
): void {
  if (fact.availability === 'available' && isPositiveInteger(fact.value)) {
    target[name] = String(fact.value);
  }
}

function exactRange(value: number): { gte: string; lte: string } {
  const serialized = String(value);
  return { gte: serialized, lte: serialized };
}

function requiredNumber(fact: ProviderVehicleFacts['categoryId']): number {
  return fact?.availability === 'available' ? fact.value : Number.NaN;
}

function validateRequest(
  requestInput: ProviderValuationRequest,
  adapterVersion: string,
): ProviderFailureCode | undefined {
  if (
    requestInput.providerKey !== AUTO_RIA_AI_PROVIDER_KEY ||
    requestInput.target !== ACTIVE_LISTING_ASK_TARGET ||
    requestInput.adapterVersion !== adapterVersion ||
    !Number.isInteger(requestInput.period) ||
    requestInput.period <= 0 ||
    !Number.isInteger(requestInput.languageId) ||
    requestInput.languageId <= 0
  ) {
    return 'invalid_input';
  }

  if (requestInput.queryMode === 'omni_id') {
    return requestInput.sourceListingId && /^\d+$/.test(requestInput.sourceListingId)
      ? undefined
      : 'invalid_input';
  }

  const facts = requestInput.normalizedFacts;
  const required = [facts.categoryId, facts.markId, facts.modelId, facts.year, facts.mileageK];
  const values = required.map((fact) =>
    fact?.availability === 'available' ? fact.value : undefined,
  );
  return values.every(isNonNegativeFinite) &&
    isPositiveInteger(values[0]) &&
    isPositiveInteger(values[1]) &&
    isPositiveInteger(values[2]) &&
    isPositiveInteger(values[3])
    ? undefined
    : 'invalid_input';
}

function mapHttpFailure(statusCode: number):
  | {
      status: Exclude<ProviderValuationOutcome['status'], 'available'>;
      failureCode: ProviderFailureCode;
      retryable: boolean;
    }
  | undefined {
  if (statusCode >= 200 && statusCode < 300) return undefined;
  if (statusCode === 401)
    return { status: 'unavailable', failureCode: 'auth_failed', retryable: false };
  if (statusCode === 403)
    return { status: 'unavailable', failureCode: 'permission_denied', retryable: false };
  if (statusCode === 404)
    return { status: 'unavailable', failureCode: 'not_found', retryable: false };
  if (statusCode === 429)
    return { status: 'deferred', failureCode: 'source_rate_limited', retryable: true };
  if (statusCode >= 500)
    return { status: 'unavailable', failureCode: 'source_5xx', retryable: true };
  return { status: 'unavailable', failureCode: 'source_4xx', retryable: false };
}

/** Normalizes the documented `similarCars` + `statisticData` response without retaining raw PII. */
export function normalizeAutoRiaAiResponse(payload: unknown): NormalizationResult {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.statisticData) ||
    !Array.isArray(payload.similarCars)
  ) {
    return { kind: 'unavailable', failureCode: 'schema_invalid' };
  }

  const statistics: ProviderStatisticProjection[] = [];
  for (const entry of payload.statisticData) {
    const normalized = normalizeStatistic(entry);
    if (!normalized) return { kind: 'unavailable', failureCode: 'schema_invalid' };
    statistics.push(normalized);
  }
  const average = statistics.find((entry) => entry.type === 'avgPrice');
  if (!average) return { kind: 'unavailable', failureCode: 'insufficient_data' };

  const comparableSummary = normalizeComparables(payload.similarCars);
  if (!comparableSummary) return { kind: 'unavailable', failureCode: 'schema_invalid' };

  const minimum = statistics.find((entry) => isMinimumStatistic(entry.type));
  const maximum = statistics.find((entry) => isMaximumStatistic(entry.type));
  const providerStatistics: ProviderStatistics = {
    comparableCount: comparableSummary.returnedCount,
    values: statistics,
    ...(minimum ? { minimum: minimum.price } : {}),
    ...(maximum ? { maximum: maximum.price } : {}),
  };
  const normalizedResponse = {
    estimate: average.price,
    statistics: providerStatistics,
    comparableSummary,
  };
  return {
    kind: 'available',
    ...normalizedResponse,
    responseFingerprint: fingerprint(normalizedResponse),
  };
}

function normalizeStatistic(value: unknown): ProviderStatisticProjection | undefined {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.price))
    return undefined;
  const parsedPrice = parseStatisticPrice(value.price);
  if (parsedPrice.kind !== 'available') return undefined;
  return {
    ...(stringField(value.id) ? { id: stringField(value.id) } : {}),
    ...(stringField(value.name) ? { name: stringField(value.name) } : {}),
    type: value.type,
    price: parsedPrice.value,
  };
}

function normalizeComparables(values: unknown[]): ProviderComparableSummary | undefined {
  const comparables: ProviderComparableProjection[] = [];
  for (const value of values) {
    const normalized = normalizeComparable(value);
    if (!normalized) return undefined;
    if (comparables.length < MAX_RETAINED_COMPARABLES) comparables.push(normalized);
  }
  return {
    returnedCount: values.length,
    retainedCount: comparables.length,
    truncated: values.length > comparables.length,
    comparables,
  };
}

function normalizeComparable(value: unknown): ProviderComparableProjection | undefined {
  if (!isRecord(value)) return undefined;
  const projected: ProviderComparableProjection = {};
  const id = stringOrNumericField(value.id);
  const brand = nestedStringField(value.brand, 'eng');
  const model = nestedStringField(value.model, 'eng');
  const year = positiveIntegerField(value.year);
  const mileageK = nonNegativeNumberField(value.raceInt);
  if (id) projected.sourceListingId = id;
  if (brand) projected.make = brand;
  if (model) projected.model = model;
  if (year != null) projected.year = year;
  if (mileageK != null) projected.mileageK = mileageK;

  if (value.price !== undefined) {
    if (!isRecord(value.price) || !isRecord(value.price.all)) return undefined;
    const parsedPrice = parseComparablePrice(value.price.all);
    if (parsedPrice.kind === 'invalid') return undefined;
    if (parsedPrice.kind === 'available') projected.price = parsedPrice.value;
  }
  return projected;
}

function parseStatisticPrice(value: Record<string, unknown>): PriceParseResult {
  return parsePriceCurrencies(value);
}

function parseComparablePrice(value: Record<string, unknown>): PriceParseResult {
  const currencies: Record<string, unknown> = {};
  for (const currency of [Currency.USD, Currency.UAH]) {
    const entry = value[currency];
    if (isRecord(entry)) currencies[currency] = entry.value;
    else if (entry !== undefined) return { kind: 'invalid' };
  }
  return parsePriceCurrencies(currencies);
}

function parsePriceCurrencies(value: Record<string, unknown>): PriceParseResult {
  let sawCurrency = false;
  for (const currency of [Currency.USD, Currency.UAH]) {
    const raw = value[currency];
    if (raw === undefined) continue;
    sawCurrency = true;
    const amount = finiteAmount(raw);
    if (amount == null || amount <= 0) return { kind: 'invalid' };
    return { kind: 'available', value: { amount, currency } };
  }
  return sawCurrency ? { kind: 'invalid' } : { kind: 'missing' };
}

function finiteAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/\s/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return undefined;
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isMinimumStatistic(type: string | undefined): boolean {
  return type?.toLowerCase().includes('min') ?? false;
}

function isMaximumStatistic(type: string | undefined): boolean {
  return type?.toLowerCase().includes('max') ?? false;
}

function safeCorrelationId(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) return undefined;
  return value;
}

function isAbortError(error: unknown): boolean {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'RequestAbortedError' ||
      error.message.toLowerCase().includes('aborted'))
  ) {
    return true;
  }
  return isRecord(error) && error.code === 'UND_ERR_ABORTED';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function stringOrNumericField(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function nestedStringField(value: unknown, key: string): string | undefined {
  return isRecord(value) ? stringField(value[key]) : undefined;
}

function positiveIntegerField(value: unknown): number | undefined {
  return isPositiveInteger(value) ? value : undefined;
}

function nonNegativeNumberField(value: unknown): number | undefined {
  return isNonNegativeFinite(value) ? value : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return 'null';
}
