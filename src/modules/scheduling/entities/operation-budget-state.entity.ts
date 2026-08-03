import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { BudgetOperation } from './budget-activity.entity';

/**
 * Per-operation monthly allocation inside the existing source-level pool.
 *
 * This is intentionally additive: it limits only operations that explicitly opt in (currently
 * `valuation_ai`) and never changes legacy monthly-pool accounting.
 */
@Entity('operation_budget_states')
@Unique('UQ_operation_budget_states_source_month_operation', ['sourceKey', 'monthKey', 'operation'])
@Index('IDX_operation_budget_states_source_month', ['sourceKey', 'monthKey'])
@Check('CHK_operation_budget_states_capacity_nonnegative', '"capacity" >= 0')
@Check('CHK_operation_budget_states_used_nonnegative', '"used" >= 0')
export class OperationBudgetState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  sourceKey!: string;

  /** UTC month key in YYYYMM format. */
  @Column({ type: 'varchar' })
  monthKey!: string;

  /** The bounded source operation. SPEC-015 initially creates rows only for `valuation_ai`. */
  @Column({ type: 'varchar' })
  operation!: BudgetOperation;

  /** Effective configured maximum for this operation in this month. */
  @Column({ type: 'int' })
  capacity!: number;

  /** Atomically incremented only when the operation allocation admits a call. */
  @Column({ type: 'int', default: 0 })
  used!: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
