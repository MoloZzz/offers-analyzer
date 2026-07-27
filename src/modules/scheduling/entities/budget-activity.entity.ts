import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type BudgetOperation =
  'search' | 'new_listing_detail' | 'recheck_detail' | 'sweep' | 'cohort_average' | 'on_demand';

export type BudgetActivityOutcome = 'allowed' | 'denied';
export type BudgetDenialReason =
  'allowed' | 'tier_cutoff' | 'daily_exhausted' | 'monthly_exhausted' | 'cooldown';

/** Immutable audit trail for one budget admission attempt (SPEC-009). */
@Entity('budget_activities')
@Index('IDX_budget_activities_source_month', ['sourceKey', 'monthKey'])
@Index('IDX_budget_activities_created_at', ['createdAt'])
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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
