import { Module } from '@nestjs/common';

import { NbuExchangeRate } from './nbu-exchange-rate';
import { EXCHANGE_RATE } from './ports/exchange-rate.port';

/** Currency conversion for display/normalization (NBU adapter). FR-014. */
@Module({
  providers: [NbuExchangeRate, { provide: EXCHANGE_RATE, useExisting: NbuExchangeRate }],
  exports: [EXCHANGE_RATE],
})
export class FxModule {}
