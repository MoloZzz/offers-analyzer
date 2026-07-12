import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type NotificationType = 'opportunity' | 'price_drop';

/** A message sent to a subscriber — unique dedupKey guarantees idempotency (FR-008/009). */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  subscriberId!: string;

  @Column('uuid')
  opportunityId!: string;

  @Column({ type: 'varchar' })
  type!: NotificationType;

  @Column({ unique: true })
  dedupKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  sentAt!: Date;
}
