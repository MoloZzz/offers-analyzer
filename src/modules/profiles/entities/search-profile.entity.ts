import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import { Currency } from '../../../common/types/money';

export type DealerPolicy = 'label' | 'exclude' | 'ignore';

export interface ProfileFilters {
  makeModelPairs: Array<{ markId: number; modelId: number }>;
  yearFrom?: number;
  yearTo?: number;
  mileageFrom?: number;
  mileageTo?: number;
}

/** A configured niche to monitor and how strictly to evaluate it (operator-controlled in v1). */
@Entity('search_profiles')
export class SearchProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', default: 'auto-ria' })
  sourceKey!: string;

  @Column('int')
  categoryId!: number;

  @Column('int', { nullable: true })
  stateId?: number | null;

  @Column('int', { nullable: true })
  cityId?: number | null;

  @Column('jsonb')
  filters!: ProfileFilters;

  @Column('int', { nullable: true })
  priceFrom?: number | null;

  @Column('int', { nullable: true })
  priceTo?: number | null;

  @Column({ type: 'enum', enum: Currency, default: Currency.USD })
  currency!: Currency;

  @Column('numeric', { precision: 4, scale: 3, default: 0.3, transformer: numericTransformer })
  minDealScore!: number;

  @Column('int')
  confidenceMinSamples!: number;

  @Column({ type: 'varchar', default: 'label' })
  dealerPolicy!: DealerPolicy;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
