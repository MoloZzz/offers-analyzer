import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import { Currency } from '../../../common/types/money';

/** A listing flagged as a candidate deal (discount + confidence, passed red-flags) — FR-005. */
@Entity('opportunities')
@Index(['profileId', 'createdAt'])
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @Column('uuid')
  profileId!: string;

  @Column('numeric', { transformer: numericTransformer })
  fairValue!: number;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column('numeric', { transformer: numericTransformer })
  askingValue!: number;

  @Column('numeric', { transformer: numericTransformer })
  discountPct!: number;

  @Column('numeric', { transformer: numericTransformer })
  confidence!: number;

  @Column('numeric', { transformer: numericTransformer })
  score!: number;

  @Column('jsonb', { default: {} })
  redFlags!: Record<string, boolean>;

  @Column({ default: false })
  notified!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
