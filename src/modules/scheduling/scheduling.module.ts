import { Module } from '@nestjs/common';

import { RateBudgetService } from './rate-budget.service';

/** Owns the in-memory rate budget. The poll pipeline lives in PollingModule (no queue in v1). */
@Module({
  providers: [RateBudgetService],
  exports: [RateBudgetService],
})
export class SchedulingModule {}
