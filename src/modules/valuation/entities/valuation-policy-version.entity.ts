import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import {
  ValuationEvidenceTarget,
  ValuationPolicyRules,
  ValuationPolicyStatus,
} from '../valuation-evidence.types';

/**
 * Immutable provider-evidence policy.  Changes are new rows/keys, never updates to an existing
 * policy, and must not be confused with a scoring ParameterSet.
 */
@Entity('valuation_policy_versions')
@Unique('UQ_valuation_policy_versions_key', ['key'])
export class ValuationPolicyVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  key!: string;

  @Column({ type: 'varchar' })
  target!: ValuationEvidenceTarget;

  @Column({ type: 'varchar' })
  status!: ValuationPolicyStatus;

  @Column('jsonb')
  rules!: ValuationPolicyRules;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
