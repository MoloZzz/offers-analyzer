import { Currency } from '../../../common/types/money';

/** DI token for the exchange-rate provider (NBU adapter in v1). */
export const EXCHANGE_RATE = Symbol('EXCHANGE_RATE');

/** Provides currency conversion rates for price normalization (FR-014). */
export interface ExchangeRate {
  /** Units of `to` per one unit of `from` at the given date (default: latest). */
  rate(from: Currency, to: Currency, at?: Date): Promise<number>;
}
