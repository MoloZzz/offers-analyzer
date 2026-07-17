import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';

/** How an outcome was recorded — a human label vs. a system-observed signal. */
export type OutcomeSource = 'manual' | 'passive';

/** Labels a human can attach to a flagged listing. */
export type ManualLabel = 'good' | 'bad' | 'bought' | 'skipped' | 'resold';

/** Labels the system observes without human input (e.g. from re-polling a listing). */
export type PassiveLabel = 'price_dropped' | 'disappeared';

export type OutcomeLabel = ManualLabel | PassiveLabel;

/**
 * Ground truth of what happened to a flagged listing — the raw material for later
 * precision/calibration computation (spec 002, E2/US1). Not consumed by any service yet.
 */
@Entity('outcomes')
@Index(['listingId'])
export class Outcome {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @Column({ type: 'uuid', nullable: true })
  opportunityId!: string | null;

  @Column({ type: 'varchar' })
  source!: OutcomeSource;

  @Column({ type: 'varchar' })
  label!: OutcomeLabel;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  value!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
