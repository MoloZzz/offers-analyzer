import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';

/** Where a deal stands. Progresses monotonically: declined | bought → sold (see deal-margin.ts). */
export type DealStage = 'declined' | 'bought' | 'sold';

export const DEAL_STAGES: readonly DealStage[] = ['declined', 'bought', 'sold'];

/** Why the operator walked away — flags a physical inspection catches but scoring misses (US7.1). */
export type DeclineReason = 'condition' | 'documents' | 'seller' | 'price' | 'other';

export const DECLINE_REASONS: readonly DeclineReason[] = [
  'condition',
  'documents',
  'seller',
  'price',
  'other',
];

/**
 * Post-deal outcome (SPEC-007 US7.1–7.2): the operator's real economics after an alert —
 * bought/declined/sold + prices + costs + realized DOM. One row per listing, upserted as the deal
 * progresses. Distinct from the append-style `outcomes` label stream (spec 002): this carries
 * structured money so realized margin (`sell − buy − costs`) can be computed and, later (US7.3),
 * become the auto-tuning target. Not consumed by spec 002's threshold tuning yet.
 */
@Entity('deal_outcomes')
// One deal per listing — the upsert key. Explicit name must match the migration's constraint;
// otherwise TypeORM's auto-generated hash name differs and `migration:generate` keeps re-creating it.
@Unique('UQ_deal_outcomes_listingId', ['listingId'])
// Explicit name for the same reason (closedDeals/openDeals filter on stage).
@Index('IDX_deal_outcomes_stage', ['stage'])
export class DealOutcome {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @Column({ type: 'uuid', nullable: true })
  opportunityId!: string | null;

  @Column({ type: 'varchar' })
  stage!: DealStage;

  @Column({ type: 'varchar', nullable: true })
  declineReason!: DeclineReason | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  buyPriceUsd!: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  actualCostsUsd!: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  sellPriceUsd!: number | null;

  @Column({ type: 'int', nullable: true })
  daysOnMarket!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  boughtAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastRemindedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
