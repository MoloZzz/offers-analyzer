import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

/** Liquidity tier: A = very liquid (sells fast), D = illiquid (sits unsold). Spec 003 US1. */
export type LiquidityTier = 'A' | 'B' | 'C' | 'D';

/**
 * Curated liquidity classification, versioned config (not learned). Keys are lowercased
 * `make|model` (models) and `make` (make-level fallback). Content-hashed for an audit trail.
 */
export interface LiquidityTable {
  version: string;
  models: Record<string, LiquidityTier>;
  makes: Record<string, LiquidityTier>;
}

/** The heuristic tables the composite factors read (spec 003). Each optional → factor off when absent. */
export interface HeuristicTables {
  liquidity?: LiquidityTable;
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
  private readonly logger = new Logger(HeuristicTablesService.name);
  private tables: HeuristicTables = {};
  private readonly contentHashes: Record<string, string> = {};

  onApplicationBootstrap(): void {
    this.load();
  }

  /** (Re)load tables from disk. Safe to call at runtime (e.g. after editing config). */
  load(): void {
    this.tables = { liquidity: this.loadLiquidity() };
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
      this.logger.warn('liquidity-tiers.json failed validation — liquidity factor disabled');
      return undefined;
    }
    return {
      version: t.version,
      models: lowerKeys(t.models),
      makes: lowerKeys(t.makes),
    };
  }

  private readJson(file: string): unknown {
    const path = join(HEURISTICS_DIR, file);
    try {
      const text = readFileSync(path, 'utf8');
      this.contentHashes[file] = createHash('sha256').update(text).digest('hex').slice(0, 12);
      return JSON.parse(text);
    } catch (err) {
      this.logger.warn(`heuristic table ${file} not loaded: ${(err as Error).message}`);
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
