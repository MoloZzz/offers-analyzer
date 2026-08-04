import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Where a ParameterSet came from — manual seed/edit vs. an automated calibration run. */
export type ParameterOrigin = 'manual' | 'calibration';

/** Per-factor multiplicative modifier bounds (spec 003). */
export interface FactorBounds {
  min: number;
  max: number;
}

/** Scoring tunables read by valuation (ADR-0005). Kept flat and jsonb-stored for easy versioning. */
export interface ScoringParams {
  scale: number;
  softFlagPenalty: number;
  mileageAnnualK: number;
  mileagePer10kPct: number;
  mileageMaxAdjPct: number;
  /**
   * Composite-score factor config (spec 003 / ADR-0006). Optional so pre-003 active rows stay valid
   * (jsonb) and default to neutral — no factors exist in Phase F, so these are unconsumed until a
   * factor ships.
   */
  factorBounds?: Record<string, FactorBounds>;
  /** Hard cap on the product of uplifting factor modifiers — enforces price dominance. */
  upliftCap?: number;
  /** Content hashes of the heuristic tables that scored a listing (audit trail; spec 003). */
  heuristicTableHashes?: Record<string, string>;

  // --- Spec 006 (ADR-0018). All optional, and all governed by one rule: an absent entry means the
  // corresponding output is **omitted**, never defaulted to a fabricated value. A missing cost table
  // must produce no `C_rec`, not a plausible-looking $0 — the system omits rather than invents.
  // None of these is read by any scoring value; they configure projections beside the score.

  /**
   * Per-input weight overrides for assessment confidence, keyed by `ConfidenceInputKey`. Present
   * (even empty) enables the output with the code defaults; absent omits it entirely (US6.1, FR-007).
   */
  confidenceWeights?: Record<string, number>;
  /** Version of `config/heuristics/cost-estimates.json` that produced `C_rec` (spec 006 US6.2). */
  costTableVersion?: string;
  /** Negotiation ladder for the buy-side estimate `B` (spec 006 US6.3). */
  torgLadder?: Record<string, number>;
  /** Expected days-on-market per liquidity tier, e.g. `{ A: 25, B: 45, C: 70, D: 120 }` (US6.2). */
  domExpectedByTier?: Record<string, number>;
  /** The operator's annual cost of capital `r`, used by `C_hold` (US6.2). */
  costOfCapital?: number;
  /** `C_fix` — paperwork, inspection and transfer fees, in USD (US6.2). */
  cFix?: number;
}

/** Default price-dominance cap when a ParameterSet predates spec 003. */
export const DEFAULT_UPLIFT_CAP = 1.25;

/**
 * A versioned, immutable snapshot of scoring tunables. Exactly one row has `active=true`
 * at any time (enforced at the service layer). See ADR-0005 for the rationale.
 */
@Entity('parameter_sets')
@Unique(['version'])
export class ParameterSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('int')
  version!: number;

  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ type: 'varchar', default: 'manual' })
  origin!: ParameterOrigin;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column('jsonb')
  params!: ScoringParams;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
