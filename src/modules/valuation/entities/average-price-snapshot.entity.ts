import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import { Currency } from '../../../common/types/money';

/**
 * Time-series of the robust cohort average price. Appended on every *fresh* fetch (cache miss),
 * so we keep the history of how a cohort's market price moves — separate from the
 * `fair_value_benchmarks` cache (which only holds the latest value). See profitability-definition.
 */
@Entity('average_price_snapshots')
@Index(['cohortKey', 'capturedAt'])
export class AveragePriceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', default: 'auto-ria' })
  sourceKey!: string;

  @Column({ type: 'varchar' })
  cohortKey!: string;

  @Column('numeric', { transformer: numericTransformer })
  value!: number;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column('int')
  sampleSize!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  capturedAt!: Date;
}
