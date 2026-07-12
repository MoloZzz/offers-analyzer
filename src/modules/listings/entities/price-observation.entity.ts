import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import { Currency } from '../../../common/types/money';

import { Listing } from './listing.entity';

/** A listing's price at a point in time — history for drop detection and own statistics. */
@Entity('price_observations')
@Index(['listingId', 'observedAt'])
export class PriceObservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @ManyToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listingId' })
  listing?: Listing;

  @Column('numeric', { transformer: numericTransformer })
  amount!: number;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column('numeric', { transformer: numericTransformer })
  amountUsd!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  observedAt!: Date;
}
