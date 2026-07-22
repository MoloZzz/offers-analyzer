import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { request } from 'undici';

import { AppConfig } from '../../common/config/configuration';
import { Currency } from '../../common/types/money';

import { ExchangeRate } from './ports/exchange-rate.port';

interface NbuRate {
  cc: string;
  rate: number;
}

/**
 * ExchangeRate backed by the National Bank of Ukraine (official, free). Rates are UAH per 1 unit
 * of a currency, cached per day. On any failure it falls back to rate 1 (no conversion) rather than
 * blocking the pipeline. FR-014.
 */
@Injectable()
export class NbuExchangeRate implements ExchangeRate {
  private readonly url: string;
  private uahPerUnit: Record<string, number> = {};
  private cachedDate = '';

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(NbuExchangeRate.name) private readonly logger: PinoLogger,
  ) {
    this.url = config.get('nbuRateUrl', { infer: true });
  }

  async rate(from: Currency, to: Currency): Promise<number> {
    if (from === to) return 1;
    const rates = await this.load();
    const fromUah = from === Currency.UAH ? 1 : rates[from];
    const toUah = to === Currency.UAH ? 1 : rates[to];
    if (!fromUah || !toUah) return 1; // unknown currency → no conversion
    return fromUah / toUah; // units of `to` per 1 unit of `from`
  }

  private async load(): Promise<Record<string, number>> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.cachedDate === today && Object.keys(this.uahPerUnit).length > 0) {
      return this.uahPerUnit;
    }
    try {
      const { body } = await request(this.url);
      const data = (await body.json()) as NbuRate[];
      const map: Record<string, number> = {};
      for (const r of data) map[r.cc] = r.rate;
      this.uahPerUnit = map;
      this.cachedDate = today;
    } catch (err) {
      this.logger.warn({ err }, 'NBU rates unavailable, using no conversion');
    }
    return this.uahPerUnit;
  }
}
