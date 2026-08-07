import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type BudgetOperation =
  | 'search'
  | 'new_listing_detail'
  | 'recheck_detail'
  | 'sweep'
  | 'cohort_average'
  | 'on_demand'
  | 'valuation_ai'
  /** SPEC-017 advisory analysis. Its own allocation under its own source key — never the AUTO.RIA pool. */
  | 'ai_analysis';

export type BudgetActivityOutcome = 'allowed' | 'denied';
/** Provider billing state at admission time; reconciled spend remains immutable audit evidence. */
export type BudgetChargeStatus = 'charged' | 'not_charged' | 'unknown' | 'not_applicable';
export type BudgetDenialReason =
  | 'allowed'
  | 'tier_cutoff'
  | 'daily_exhausted'
  | 'monthly_exhausted'
  | 'admission_contention'
  | 'operation_allocation_exhausted'
  | 'operation_allocation_unavailable'
  | 'per_admin_rate_limited'
  | 'cooldown'
  | 'paused';

/** Immutable audit trail for one budget admission attempt (SPEC-009). */
@Entity('budget_activities')
@Index('IDX_budget_activities_source_month', ['sourceKey', 'monthKey'])
@Index('IDX_budget_activities_created_at', ['createdAt'])
@Index('IDX_budget_activities_request_fingerprint', ['requestFingerprint'])
export class BudgetActivity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  sourceKey!: string;

  @Column({ type: 'varchar' })
  monthKey!: string;

  @Column({ type: 'varchar' })
  operation!: BudgetOperation;

  @Column({ type: 'int' })
  priorityTier!: number;

  @Column({ type: 'varchar', nullable: true })
  profileId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  profileName?: string | null;

  @Column({ type: 'int' })
  cost!: number;

  @Column({ type: 'varchar' })
  outcome!: BudgetActivityOutcome;

  @Column({ type: 'varchar' })
  reason!: BudgetDenialReason;

  /**
   * Who triggered a human-triggered operation (SPEC-017): the admin's Telegram chat id. Null for
   * every automatic operation, which is exactly what makes the per-admin rate limit countable.
   */
  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null;

  /** Redacted canonical provider-request identifier; absent for legacy source operations. */
  @Column({ type: 'varchar', nullable: true })
  requestFingerprint?: string | null;

  /**
   * Billing observation at admission time. This is nullable for pre-SPEC-015 rows and is never
   * retroactively rewritten as part of the immutable activity ledger.
   */
  @Column({ type: 'varchar', nullable: true })
  chargeStatus?: BudgetChargeStatus | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
