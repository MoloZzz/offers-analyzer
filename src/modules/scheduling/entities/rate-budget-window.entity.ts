import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Durable request-budget counter (one row per source + hour window). Persisting it in Postgres
 * means the count survives process restarts, so we don't over-spend and hit HTTP 429 after a
 * restart (the weakness of the earlier in-memory counter). See ADR-0004 / backlog B13.
 */
@Entity('rate_budget_windows')
@Unique(['sourceKey', 'windowKey'])
export class RateBudgetWindow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  sourceKey!: string;

  /** UTC hour window, e.g. `2026071602`. */
  @Column({ type: 'varchar' })
  windowKey!: string;

  @Column('int', { default: 0 })
  used!: number;
}
