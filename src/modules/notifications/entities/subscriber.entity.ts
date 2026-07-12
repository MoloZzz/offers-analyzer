import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SubscriberState = 'active' | 'muted' | 'unsubscribed';

/** A Telegram user and their subscription state (FR-015). */
@Entity('subscribers')
export class Subscriber {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  telegramChatId!: string;

  @Column({ type: 'varchar', default: 'active' })
  state!: SubscriberState;

  @Column('uuid', { array: true, nullable: true })
  profileIds?: string[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
