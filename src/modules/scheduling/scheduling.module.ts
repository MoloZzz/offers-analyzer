import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RateBudgetWindow } from './entities/rate-budget-window.entity';
import { RateBudgetService } from './rate-budget.service';

/** Owns the durable (Postgres-backed) rate budget. The poll pipeline lives in PollingModule. */
@Module({
  imports: [TypeOrmModule.forFeature([RateBudgetWindow])],
  providers: [RateBudgetService],
  exports: [RateBudgetService],
})
export class SchedulingModule {}
