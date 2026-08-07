import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { AnalysisFact, AnalysisOutput, AnalysisStatus, AnalysisTerminalReason } from '../analysis.types';

/**
 * SPEC-017 T020 — one immutable, insert-only record per attempt (FR-008).
 *
 * Nothing updates a row here: a re-analysis inserts a new one. That is what makes a
 * non-reproducible output auditable after the fact — the model id, prompt version, sampling
 * parameters and the exact fact snapshot are the only way to explain, months later, why an answer
 * said what it said. Rendering reads this table and never the live provider (FR-009).
 *
 * The composite index is the cache lookup (FR-005); `capturedAt` serves `/ai_audit`.
 */
@Entity('ai_analyses')
@Index('IDX_ai_analyses_cache_key', ['listingId', 'inputFactHash', 'promptVersion', 'modelId'])
@Index('IDX_ai_analyses_captured_at', ['capturedAt'])
export class AiAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  /** Covers price, description, and every source fact — any material change invalidates the cache. */
  @Column({ type: 'varchar' })
  inputFactHash!: string;

  @Column({ type: 'varchar' })
  promptVersion!: string;

  @Column({ type: 'varchar' })
  modelId!: string;

  @Column({ type: 'varchar' })
  adapterVersion!: string;

  @Column('jsonb')
  samplingParams!: Record<string, unknown>;

  /** The exact facts sent, including the quoted seller text, so the answer stays explainable. */
  @Column('jsonb')
  factSnapshot!: { facts: AnalysisFact[]; untrustedText: string | null };

  /** Populated only for a successful, schema-valid attempt. Never a partial value. */
  @Column('jsonb', { nullable: true })
  output?: AnalysisOutput | null;

  @Column({ type: 'varchar' })
  status!: AnalysisStatus;

  @Column({ type: 'varchar' })
  terminalReason!: AnalysisTerminalReason;

  /** Free-text detail of a schema violation; never contains provider credentials. */
  @Column({ type: 'varchar', nullable: true })
  violation?: string | null;

  /** Telegram chat id of the admin who triggered the attempt (FR-001 — always a human). */
  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  capturedAt!: Date;
}
