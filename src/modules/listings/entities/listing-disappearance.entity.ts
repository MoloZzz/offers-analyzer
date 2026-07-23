import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';

/** How a disappearance event was recorded — from live polling vs. an initial-wave backfill. */
export type DetectionMode = 'live' | 'backfill';

/**
 * A realized-"sale" event — a listing that stopped appearing in search results after
 * eligibility/coverage/grace filters ruled out the systematic false-positive sources (spec
 * 004, US4.1/4.2). One row per listing, ever; carries the full calibration payload so later
 * phases can compute the correction factor `k` without re-reading history.
 */
@Entity('listing_disappearances')
// Explicit name must match the migration's constraint (`UQ_listing_disappearances_listingId`);
// otherwise TypeORM's auto-generated hash name differs from the DB and `migration:generate`
// keeps drop/re-creating it.
@Unique('UQ_listing_disappearances_listingId', ['listingId'])
@Index('IDX_listing_disappearances_disappearedAt', ['disappearedAt'])
export class ListingDisappearance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @Column({ type: 'varchar', nullable: true })
  cohortKey!: string | null;

  @Column('numeric', { transformer: numericTransformer })
  lastKnownPriceUsd!: number;

  @Column({ type: 'timestamptz' })
  firstSeenAt!: Date;

  @Column({ type: 'timestamptz' })
  disappearedAt!: Date;

  @Column('int')
  domDays!: number;

  @Column('int')
  priceCutsCount!: number;

  @Column('boolean')
  hadPriceCut!: boolean;

  @Column({ type: 'boolean', default: false })
  isRelist!: boolean;

  @Column({ type: 'uuid', nullable: true })
  relistListingId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  relistDetectedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reappearedAt!: Date | null;

  @Column({ type: 'varchar' })
  detectionMode!: DetectionMode;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
