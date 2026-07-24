import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Durable request-budget counter (one row per source + hour window, or monthly pool row).
 * Persisting it in Postgres means the count survives process restarts, so we don't over-spend
 * and hit HTTP 429 after a restart. See ADR-0004 / backlog B13, and ADR-0009 for monthly pools.
 *
 * budgetType='hourly': windowKey is YYYYMMDDHH (e.g., 2026071602), tracks hourly consumption
 * budgetType='monthly': windowKey is YYYYMM (e.g., 202607), tracks monthly pool consumption
 */
@Entity('rate_budget_windows')
@Unique(['sourceKey', 'windowKey'])
export class RateBudgetWindow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  sourceKey!: string;

  /** UTC window: YYYYMMDDHH for hourly (e.g., 2026071602), YYYYMM for monthly (e.g., 202607). */
  @Column({ type: 'varchar' })
  windowKey!: string;

  @Column('int', { default: 0 })
  used!: number;

  /** Type of budget window: 'hourly' (legacy) or 'monthly' (ADR-0009). Defaults to 'hourly'. */
  @Column({ type: 'varchar', default: 'hourly' })
  budgetType!: string;

  /** Request tier (1-5) for priority queue; NULL for pool aggregate rows. */
  @Column({ type: 'int', nullable: true })
  tier?: number | null;

  /** Timestamp when this window row was created, for diagnostics and cleanup. */
  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt!: Date;
}
