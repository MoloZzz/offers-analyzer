import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

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

  @Column({ type: 'varchar', default: 'auto-ria' })
  sourceKey!: string;

  @Column({ type: 'varchar' })
  externalId!: string;

  @Column({ type: 'varchar' })
  make!: string;

  @Column({ type: 'varchar' })
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

  @Column({ type: 'varchar', nullable: true })
  vin?: string | null;

  @Column({ type: 'varchar' })
  url!: string;

  /** Latest seller description snapshot — kept for re-scanning condition signals without re-fetching. */
  @Column({ type: 'text', nullable: true })
  description?: string | null;

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

  // Last valuation result for this listing (recorded for every evaluated listing, not only opportunities).
  @Column('numeric', { nullable: true, transformer: numericTransformer })
  lastScore?: number | null;

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  lastDiscountPct?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastEvaluatedAt?: Date | null;

  /** The profile that most recently surfaced/evaluated this listing (for per-profile calibration). */
  @Column({ type: 'uuid', nullable: true })
  profileId?: string | null;
}
