import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Monthly budget pool state for ADR-0009: tracks the monthly pool allocation,
 * daily sub-budget calculation, and consumption across the month.
 *
 * One row per source per month (e.g., 'auto-ria' for 202607).
 */
@Entity('monthly_budget_states')
@Unique(['sourceKey', 'monthKey'])
export class MonthlyBudgetState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  sourceKey!: string;

  /** Month key in YYYYMM format, e.g., 202607 for July 2026. */
  @Column({ type: 'varchar' })
  monthKey!: string;

  /** Total budget for this month (default 20,000). */
  @Column({ type: 'int' })
  poolSize!: number;

  /** Cumulative usage this month across all days. */
  @Column({ type: 'int', default: 0 })
  poolUsed!: number;

  /** Reserve amount (15% of poolSize), held back from daily allocation. */
  @Column({ type: 'int' })
  reserveAmount!: number;

  /** When the reserve is released (3 days before month end, UTC). */
  @Column({ type: 'timestamp' })
  reserveReleasesAt!: Date;

  /** Daily budget calculated at the start of each UTC day. */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  dailyBudget!: number;

  /** Consumption on the current UTC day (reset each day). */
  @Column({ type: 'int', default: 0 })
  dailyUsed!: number;

  /** Last UTC date this row's daily budget was recalculated (YYYY-MM-DD format). */
  @Column({ type: 'varchar', nullable: true })
  lastDayCalculated?: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamp', default: () => 'now()', onUpdate: 'now()' })
  updatedAt!: Date;
}
