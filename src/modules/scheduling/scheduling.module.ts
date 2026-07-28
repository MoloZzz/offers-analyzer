import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BudgetActivity } from './entities/budget-activity.entity';
import { MonthlyBudgetState } from './entities/monthly-budget-state.entity';
import { RateBudgetWindow } from './entities/rate-budget-window.entity';
import { RateBudgetService } from './rate-budget.service';

/** Owns the durable (Postgres-backed) rate budget. The poll pipeline lives in PollingModule. */
@Module({
  imports: [TypeOrmModule.forFeature([RateBudgetWindow, MonthlyBudgetState, BudgetActivity])],
  providers: [RateBudgetService],
  exports: [RateBudgetService],
})
export class SchedulingModule {}
