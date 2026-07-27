import { MigrationInterface, QueryRunner } from 'typeorm';

export class Spec009BudgetObservability1785312000000 implements MigrationInterface {
  name = 'Spec009BudgetObservability1785312000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "budget_activities" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceKey" character varying NOT NULL,
      "monthKey" character varying NOT NULL, "operation" character varying NOT NULL,
      "priorityTier" integer NOT NULL, "profileId" character varying, "profileName" character varying,
      "cost" integer NOT NULL, "outcome" character varying NOT NULL, "reason" character varying NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_budget_activities_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "IDX_budget_activities_source_month" ON "budget_activities" ("sourceKey", "monthKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_budget_activities_created_at" ON "budget_activities" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_budget_activities_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_budget_activities_source_month"`);
    await queryRunner.query(`DROP TABLE "budget_activities"`);
  }
}
