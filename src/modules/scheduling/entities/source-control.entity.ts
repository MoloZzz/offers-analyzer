import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Durable operator control for per-source daily request-limit enforcement. */
@Entity('source_controls')
export class SourceControl {
  @PrimaryColumn({ type: 'varchar' })
  sourceKey!: string;

  @Column({ type: 'boolean', default: false })
  dailyLimitEnabled!: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
