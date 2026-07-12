import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import { Currency } from '../../../common/types/money';

/** Cached cohort valuation (RIA average) so we don't spend request budget repeatedly. */
@Entity('fair_value_benchmarks')
@Unique(['sourceKey', 'cohortKey'])
export class FairValueBenchmark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ default: 'auto-ria' })
  sourceKey!: string;

  @Column()
  cohortKey!: string;

  @Column('numeric', { transformer: numericTransformer })
  value!: number;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column('int')
  sampleSize!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  computedAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;
}
