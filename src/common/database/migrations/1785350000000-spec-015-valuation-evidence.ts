import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SPEC-015 is strictly additive.  It records shadow-only provider market evidence and gives that
 * traffic a dedicated operation allocation; it does not touch legacy benchmark, score, or alert
 * columns.
 */
export class Spec015ValuationEvidence1785350000000 implements MigrationInterface {
  name = 'Spec015ValuationEvidence1785350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "valuation_policy_versions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "key" character varying NOT NULL,
      "target" character varying NOT NULL,
      "status" character varying NOT NULL,
      "rules" jsonb NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_valuation_policy_versions_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_valuation_policy_versions_key" UNIQUE ("key")
    )`);

    await queryRunner.query(`CREATE TABLE "valuation_evidence" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "listingId" uuid NOT NULL,
      "profileId" uuid,
      "opportunityId" uuid,
      "providerKey" character varying NOT NULL,
      "target" character varying NOT NULL,
      "trigger" character varying NOT NULL,
      "selectionReason" character varying NOT NULL,
      "policyKey" character varying NOT NULL,
      "policySnapshot" jsonb NOT NULL,
      "adapterVersion" character varying NOT NULL,
      "queryMode" character varying NOT NULL,
      "requestFingerprint" character varying NOT NULL,
      "inputSnapshot" jsonb NOT NULL,
      "requestProjection" jsonb NOT NULL,
      "status" character varying NOT NULL,
      "failureCode" character varying,
      "comparability" character varying NOT NULL,
      "comparabilityReasons" jsonb NOT NULL,
      "inputCompleteness" jsonb NOT NULL,
      "estimateAmount" numeric,
      "currency" character varying,
      "providerStatistics" jsonb,
      "comparableSummary" jsonb,
      "legacyReference" jsonb,
      "sourceCapturedAt" TIMESTAMP WITH TIME ZONE,
      "expiresAt" TIMESTAMP WITH TIME ZONE,
      "responseFingerprint" character varying,
      "chargeStatus" character varying NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_valuation_evidence_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `INSERT INTO "valuation_policy_versions" ("key", "target", "status", "rules")
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT ("key") DO NOTHING`,
      [
        'ai-shadow-v1',
        'active_listing_ask',
        'shadow',
        JSON.stringify({
          target: 'active_listing_ask',
          requiredFacts: ['make', 'model', 'year'],
          attributeRequiredFacts: [
            'categoryId',
            'make',
            'model',
            'markId',
            'modelId',
            'year',
            'mileageK',
          ],
          query: { preferredMode: 'omni_id', attributesRequireActualMileage: true },
          allowedRelaxations: [],
          freshnessHours: 24,
          sampling: { algorithm: 'sha256-mod-10000', defaultRate: 0 },
          discrepancyBucketsPct: [20],
        }),
      ],
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_valuation_evidence_listing_created_at" ON "valuation_evidence" ("listingId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_valuation_evidence_request_policy_created_at" ON "valuation_evidence" ("requestFingerprint", "policyKey", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_valuation_evidence_status_created_at" ON "valuation_evidence" ("status", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_valuation_evidence_profile_created_at" ON "valuation_evidence" ("profileId", "createdAt")',
    );

    await queryRunner.query(`CREATE TABLE "operation_budget_states" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "sourceKey" character varying NOT NULL,
      "monthKey" character varying NOT NULL,
      "operation" character varying NOT NULL,
      "capacity" integer NOT NULL,
      "used" integer NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_operation_budget_states_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_operation_budget_states_source_month_operation" UNIQUE ("sourceKey", "monthKey", "operation"),
      CONSTRAINT "CHK_operation_budget_states_capacity_nonnegative" CHECK ("capacity" >= 0),
      CONSTRAINT "CHK_operation_budget_states_used_nonnegative" CHECK ("used" >= 0)
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_operation_budget_states_source_month" ON "operation_budget_states" ("sourceKey", "monthKey")',
    );

    await queryRunner.query('ALTER TABLE "listings" ADD "lastValuationEvidenceId" uuid');
    await queryRunner.query('ALTER TABLE "opportunities" ADD "valuationEvidenceId" uuid');
    await queryRunner.query('ALTER TABLE "budget_activities" ADD "requestFingerprint" character varying');
    await queryRunner.query('ALTER TABLE "budget_activities" ADD "chargeStatus" character varying');
    await queryRunner.query(
      'CREATE INDEX "IDX_budget_activities_request_fingerprint" ON "budget_activities" ("requestFingerprint")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_budget_activities_request_fingerprint"');
    await queryRunner.query('ALTER TABLE "budget_activities" DROP COLUMN "chargeStatus"');
    await queryRunner.query('ALTER TABLE "budget_activities" DROP COLUMN "requestFingerprint"');
    await queryRunner.query('ALTER TABLE "opportunities" DROP COLUMN "valuationEvidenceId"');
    await queryRunner.query('ALTER TABLE "listings" DROP COLUMN "lastValuationEvidenceId"');
    await queryRunner.query('DROP INDEX "public"."IDX_operation_budget_states_source_month"');
    await queryRunner.query('DROP TABLE "operation_budget_states"');
    await queryRunner.query('DROP INDEX "public"."IDX_valuation_evidence_profile_created_at"');
    await queryRunner.query('DROP INDEX "public"."IDX_valuation_evidence_status_created_at"');
    await queryRunner.query('DROP INDEX "public"."IDX_valuation_evidence_request_policy_created_at"');
    await queryRunner.query('DROP INDEX "public"."IDX_valuation_evidence_listing_created_at"');
    await queryRunner.query('DROP TABLE "valuation_evidence"');
    await queryRunner.query('DROP TABLE "valuation_policy_versions"');
  }
}
