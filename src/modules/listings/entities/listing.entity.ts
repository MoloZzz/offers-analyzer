import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import { Currency } from '../../../common/types/money';
import { SellerType } from '../../sources/ports/listing-source.port';

export type ListingStatus = 'active' | 'removed' | 'sold';

/** A car advertisement observed from a source. Unique per (sourceKey, externalId) — dedup (FR-008). */
@Entity('listings')
@Unique(['sourceKey', 'externalId'])
@Index(['make', 'model', 'year', 'stateId'])
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ default: 'auto-ria' })
  sourceKey!: string;

  @Column()
  externalId!: string;

  @Column()
  make!: string;

  @Column()
  model!: string;

  @Column('int', { nullable: true })
  markId?: number | null;

  @Column('int', { nullable: true })
  modelId?: number | null;

  @Column('int')
  year!: number;

  @Column('int', { nullable: true })
  mileage?: number | null;

  @Column('int', { nullable: true })
  stateId?: number | null;

  @Column('int', { nullable: true })
  cityId?: number | null;

  @Column({ type: 'varchar', default: 'unknown' })
  sellerType!: SellerType;

  @Column({ nullable: true })
  vin?: string | null;

  @Column()
  url!: string;

  @Column('numeric', { transformer: numericTransformer })
  currentAmount!: number;

  @Column({ type: 'enum', enum: Currency })
  currentCurrency!: Currency;

  @Column({ type: 'varchar', default: 'active' })
  status!: ListingStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  firstSeenAt!: Date;

  @Column({ type: 'timestamptz' })
  lastSeenAt!: Date;
}
