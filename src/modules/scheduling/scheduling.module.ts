import { Module } from '@nestjs/common';

import { RateBudgetService } from './rate-budget.service';

/** Owns the rate budget now; the cron + BullMQ poll pipeline is added in US1. */
@Module({
  providers: [RateBudgetService],
  exports: [RateBudgetService],
})
export class SchedulingModule {}
