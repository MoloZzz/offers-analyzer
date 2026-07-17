import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Where a ParameterSet came from — manual seed/edit vs. an automated calibration run. */
export type ParameterOrigin = 'manual' | 'calibration';

/** Scoring tunables read by valuation (ADR-0005). Kept flat and jsonb-stored for easy versioning. */
export interface ScoringParams {
  scale: number;
  softFlagPenalty: number;
  mileageAnnualK: number;
  mileagePer10kPct: number;
  mileageMaxAdjPct: number;
}

/**
 * A versioned, immutable snapshot of scoring tunables. Exactly one row has `active=true`
 * at any time (enforced at the service layer). See ADR-0005 for the rationale.
 */
@Entity('parameter_sets')
@Unique(['version'])
export class ParameterSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('int')
  version!: number;

  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ type: 'varchar', default: 'manual' })
  origin!: ParameterOrigin;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column('jsonb')
  params!: ScoringParams;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
