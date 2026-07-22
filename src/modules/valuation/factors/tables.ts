import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/** Liquidity tier: A = very liquid (sells fast), D = illiquid (sits unsold). Spec 003 US1. */
export type LiquidityTier = 'A' | 'B' | 'C' | 'D';

/** Repair risk tier: LOW / MEDIUM / HIGH. Spec 003 US2. */
export type RepairRiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Curated liquidity classification, versioned config (not learned). Keys are lowercased
 * `make|model` (models) and `make` (make-level fallback). Content-hashed for an audit trail.
 */
export interface LiquidityTable {
  version: string;
  models: Record<string, LiquidityTier>;
  makes: Record<string, LiquidityTier>;
}

/**
 * Curated repair-risk patterns, versioned config. Keys are lowercased `make|model` for model-specific
 * rules, plus pattern arrays for engine/gearbox/fuel/age combinations. Content-hashed for audit trail.
 */
export interface RepairRiskTable {
  version: string;
  models: Record<string, RepairRiskTier>;
  makes: Record<string, RepairRiskTier>;
  patterns: RepairRiskPattern[];
}

/** A pattern that yields a risk tier when matched. */
export interface RepairRiskPattern {
  tier: RepairRiskTier;
  /** Gearbox keywords (e.g. 'dsg', 'cvt', 'air suspension', 'robot') — matched case-insensitively. */
  gearbox?: string[];
  /** Engine keywords (e.g. 'w12', 'v8', 'v10', 'v12', 'turbo diesel', 'twin turbo') — matched case-insensitively. */
  engine?: string[];
  /** Fuel keywords (e.g. 'diesel', 'hybrid', 'lpg', 'cng') — matched case-insensitively. */
  fuel?: string[];
  /** Minimum age in years for this pattern to apply. */
  minAge?: number;
  /** Maximum age in years (optional). */
  maxAge?: number;
  /** Reason shown to operator when pattern fires. */
  reason: string;
}

/** The heuristic tables the composite factors read (spec 003). Each optional → factor off when absent. */
export interface HeuristicTables {
  liquidity?: LiquidityTable;
  repairRisk?: RepairRiskTable;
}

const HEURISTICS_DIR = join(process.cwd(), 'config', 'heuristics');

/**
 * Loads and validates the heuristic tables from `config/heuristics/*.json` at boot. Tolerant of a
 * missing/invalid file (logs a warning and leaves that table undefined → the factor stays neutral),
 * so a bad table can never crash scoring or silently fabricate signal. Records each table's content
 * hash for the audit trail (which table version scored a listing).
 */
@Injectable()
export class HeuristicTablesService implements OnApplicationBootstrap {
  private tables: HeuristicTables = {};
  private readonly contentHashes: Record<string, string> = {};

  constructor(
    @InjectPinoLogger(HeuristicTablesService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.load();
  }

  /** (Re)load tables from disk. Safe to call at runtime (e.g. after editing config). */
  load(): void {
    this.tables = {
      liquidity: this.loadLiquidity(),
      repairRisk: this.loadRepairRisk(),
    };
  }

  get(): HeuristicTables {
    return this.tables;
  }

  /** Content hashes of the loaded tables (for recording on the active ParameterSet). */
  hashes(): Record<string, string> {
    return { ...this.contentHashes };
  }

  private loadLiquidity(): LiquidityTable | undefined {
    const raw = this.readJson('liquidity-tiers.json');
    if (!raw) return undefined;
    const t = raw as Partial<LiquidityTable>;
    if (typeof t.version !== 'string' || !isTierMap(t.models) || !isTierMap(t.makes)) {
      this.logger.warn(
        { file: 'liquidity-tiers.json' },
        'Heuristic table failed validation — liquidity factor disabled',
      );
      return undefined;
    }
    return {
      version: t.version,
      models: lowerKeys(t.models),
      makes: lowerKeys(t.makes),
    };
  }

  private loadRepairRisk(): RepairRiskTable | undefined {
    const raw = this.readJson('repair-risk.json');
    if (!raw) return undefined;
    const t = raw as Partial<RepairRiskTable>;
    if (typeof t.version !== 'string' || !Array.isArray(t.patterns)) {
      this.logger.warn(
        { file: 'repair-risk.json' },
        'Heuristic table failed validation — repair-risk factor disabled',
      );
      return undefined;
    }
    // Validate models/makes if present
    const models = t.models ? lowerKeys(t.models) : {};
    const makes = t.makes ? lowerKeys(t.makes) : {};
    for (const tier of Object.values(models)) {
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(tier)) {
        this.logger.warn(
          { file: 'repair-risk.json', reason: 'invalid-model-tier' },
          'Heuristic table failed validation — repair-risk factor disabled',
        );
        return undefined;
      }
    }
    for (const tier of Object.values(makes)) {
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(tier)) {
        this.logger.warn(
          { file: 'repair-risk.json', reason: 'invalid-make-tier' },
          'Heuristic table failed validation — repair-risk factor disabled',
        );
        return undefined;
      }
    }
    for (const p of t.patterns) {
      if (!p.tier || !['LOW', 'MEDIUM', 'HIGH'].includes(p.tier) || !p.reason) {
        this.logger.warn(
          { file: 'repair-risk.json', reason: 'invalid-pattern' },
          'Heuristic table failed validation — repair-risk factor disabled',
        );
        return undefined;
      }
    }
    return {
      version: t.version,
      models,
      makes,
      patterns: t.patterns,
    };
  }

  private readJson(file: string): unknown {
    const path = join(HEURISTICS_DIR, file);
    try {
      const text = readFileSync(path, 'utf8');
      this.contentHashes[file] = createHash('sha256').update(text).digest('hex').slice(0, 12);
      return JSON.parse(text);
    } catch (err) {
      this.logger.warn({ file, err }, 'Heuristic table not loaded');
      return undefined;
    }
  }
}

const TIERS: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D']);

function isTierMap(v: unknown): v is Record<string, LiquidityTier> {
  return (
    typeof v === 'object' &&
    v !== null &&
    Object.values(v).every((x) => typeof x === 'string' && TIERS.has(x))
  );
}

function lowerKeys<T>(m: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(m)) out[k.toLowerCase()] = val;
  return out;
}
