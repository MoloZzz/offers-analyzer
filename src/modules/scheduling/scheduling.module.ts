import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BudgetActivity } from './entities/budget-activity.entity';
import { MonthlyBudgetState } from './entities/monthly-budget-state.entity';
import { OperationBudgetState } from './entities/operation-budget-state.entity';
import { RateBudgetWindow } from './entities/rate-budget-window.entity';
import { SourceControl } from './entities/source-control.entity';
import { RateBudgetService } from './rate-budget.service';
import { SourceControlService } from './source-control.service';

/** Owns the durable (Postgres-backed) rate budget. The poll pipeline lives in PollingModule. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RateBudgetWindow,
      MonthlyBudgetState,
      OperationBudgetState,
      BudgetActivity,
      SourceControl,
    ]),
  ],
  providers: [RateBudgetService, SourceControlService],
  exports: [RateBudgetService, SourceControlService],
})
export class SchedulingModule {}
