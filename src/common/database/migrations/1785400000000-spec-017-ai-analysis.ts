import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SPEC-017 T021 — strictly additive, append-only.
 *
 * One new table for immutable advisory-analysis attempts, plus one nullable column on the existing
 * budget ledger so a human-triggered operation records **who** triggered it (the per-admin rate
 * limit is counted from it). Nothing here touches a scoring, benchmark, threshold, or alert column;
 * the feature ships disabled and a zero allocation keeps it inert even after this runs.
 */
export class Spec017AiAnalysis1785400000000 implements MigrationInterface {
  name = 'Spec017AiAnalysis1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "ai_analyses" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "listingId" uuid NOT NULL,
      "inputFactHash" character varying NOT NULL,
      "promptVersion" character varying NOT NULL,
      "modelId" character varying NOT NULL,
      "adapterVersion" character varying NOT NULL,
      "samplingParams" jsonb NOT NULL,
      "factSnapshot" jsonb NOT NULL,
      "output" jsonb,
      "status" character varying NOT NULL,
      "terminalReason" character varying NOT NULL,
      "violation" character varying,
      "actorId" character varying,
      "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_ai_analyses_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_ai_analyses_cache_key" ON "ai_analyses" ("listingId", "inputFactHash", "promptVersion", "modelId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ai_analyses_captured_at" ON "ai_analyses" ("capturedAt")',
    );

    await queryRunner.query('ALTER TABLE "budget_activities" ADD "actorId" character varying');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "budget_activities" DROP COLUMN "actorId"');
    await queryRunner.query('DROP INDEX "public"."IDX_ai_analyses_captured_at"');
    await queryRunner.query('DROP INDEX "public"."IDX_ai_analyses_cache_key"');
    await queryRunner.query('DROP TABLE "ai_analyses"');
  }
}
