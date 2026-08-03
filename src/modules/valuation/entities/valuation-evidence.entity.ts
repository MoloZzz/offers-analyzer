import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { numericTransformer } from '../../../common/database/numeric.transformer';
import {
  JsonObject,
  LegacyValuationReference,
  ValuationChargeStatus,
  ValuationComparability,
  ValuationEvidenceStatus,
  ValuationEvidenceTarget,
  ValuationEvidenceTrigger,
  ValuationFactSnapshot,
  ValuationInputCompleteness,
  ValuationPolicySnapshot,
  ValuationQueryMode,
  ValuationSelectionReason,
} from '../valuation-evidence.types';

/**
 * Append-only terminal provider-evidence attempt.  The service only creates rows; retries share
 * a canonical request fingerprint rather than overwriting an historical answer.
 */
@Entity('valuation_evidence')
@Index('IDX_valuation_evidence_listing_created_at', ['listingId', 'createdAt'])
@Index('IDX_valuation_evidence_request_policy_created_at', [
  'requestFingerprint',
  'policyKey',
  'createdAt',
])
@Index('IDX_valuation_evidence_status_created_at', ['status', 'createdAt'])
@Index('IDX_valuation_evidence_profile_created_at', ['profileId', 'createdAt'])
export class ValuationEvidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  listingId!: string;

  @Column('uuid', { nullable: true })
  profileId?: string | null;

  @Column('uuid', { nullable: true })
  opportunityId?: string | null;

  @Column({ type: 'varchar' })
  providerKey!: string;

  @Column({ type: 'varchar' })
  target!: ValuationEvidenceTarget;

  @Column({ type: 'varchar' })
  trigger!: ValuationEvidenceTrigger;

  @Column({ type: 'varchar' })
  selectionReason!: ValuationSelectionReason;

  @Column({ type: 'varchar' })
  policyKey!: string;

  @Column('jsonb')
  policySnapshot!: ValuationPolicySnapshot;

  @Column({ type: 'varchar' })
  adapterVersion!: string;

  @Column({ type: 'varchar' })
  queryMode!: ValuationQueryMode;

  @Column({ type: 'varchar' })
  requestFingerprint!: string;

  @Column('jsonb')
  inputSnapshot!: ValuationFactSnapshot;

  @Column('jsonb')
  requestProjection!: JsonObject;

  @Column({ type: 'varchar' })
  status!: ValuationEvidenceStatus;

  @Column({ type: 'varchar', nullable: true })
  failureCode?: string | null;

  @Column({ type: 'varchar' })
  comparability!: ValuationComparability;

  @Column('jsonb')
  comparabilityReasons!: string[];

  @Column('jsonb')
  inputCompleteness!: ValuationInputCompleteness;

  /** Provider-declared central estimate only; no local synthetic substitute is permitted. */
  @Column('numeric', { nullable: true, transformer: numericTransformer })
  estimateAmount?: number | null;

  @Column({ type: 'varchar', nullable: true })
  currency?: string | null;

  @Column('jsonb', { nullable: true })
  providerStatistics?: JsonObject | null;

  @Column('jsonb', { nullable: true })
  comparableSummary?: JsonObject | null;

  @Column('jsonb', { nullable: true })
  legacyReference?: LegacyValuationReference | null;

  /** Local receipt/capture time unless a future provider contract supplies an explicit source as-of time. */
  @Column({ type: 'timestamptz', nullable: true })
  sourceCapturedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  responseFingerprint?: string | null;

  @Column({ type: 'varchar' })
  chargeStatus!: ValuationChargeStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
