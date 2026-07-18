import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';

/**
 * Car-level de-dup across relists (identity = VIN): the lowest asking price (USD) we've ever
 * alerted for a given car, so a re-listing under a new listing id only re-alerts when cheaper.
 */
@Entity('alerted_cars')
@Unique(['carKey'])
export class AlertedCar {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  carKey!: string;

  @Column('numeric', { transformer: numericTransformer })
  lowestAlertedUsd!: number;

  @Column({ type: 'uuid', nullable: true })
  lastListingId!: string | null;

  @Column({ type: 'timestamptz' })
  lastAlertedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
