import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Whether a calibration run only proposed a change or also applied it. */
export type CalibrationMode = 'propose' | 'auto';

/**
 * Record of a single calibration run — what inputs it saw, what it proposed, and whether the
 * proposal was applied (spec 002, E3a). This slice is PROPOSE-ONLY: `applied` is always false
 * and nothing else in the system consumes `proposal` yet.
 */
@Entity('calibration_runs')
export class CalibrationRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  ranAt!: Date;

  /** Which profile this run is about; null = global. */
  @Column({ type: 'uuid', nullable: true })
  profileId?: string | null;

  @Column({ type: 'varchar', default: 'threshold' })
  capability!: string;

  @Column({ type: 'varchar', default: 'propose' })
  mode!: CalibrationMode;

  @Column('jsonb')
  inputsSummary!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  proposal!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  applied!: boolean;

  @Column({ type: 'text' })
  reason!: string;
}
