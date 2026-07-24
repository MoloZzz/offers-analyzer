import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1785194400000 implements MigrationInterface {
    name = 'Migration1785194400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new columns to rate_budget_windows for ADR-0009 monthly pool support
        await queryRunner.query(`ALTER TABLE "rate_budget_windows" ADD COLUMN "budgetType" character varying NOT NULL DEFAULT 'hourly'`);
        await queryRunner.query(`ALTER TABLE "rate_budget_windows" ADD COLUMN "tier" integer`);
        await queryRunner.query(`ALTER TABLE "rate_budget_windows" ADD COLUMN "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);

        // Create monthly_budget_states table for ADR-0009 monthly pool tracking
        await queryRunner.query(`CREATE TABLE "monthly_budget_states" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "sourceKey" character varying NOT NULL,
            "monthKey" character varying NOT NULL,
            "poolSize" integer NOT NULL,
            "poolUsed" integer NOT NULL DEFAULT 0,
            "reserveAmount" integer NOT NULL,
            "reserveReleasesAt" TIMESTAMP NOT NULL,
            "dailyBudget" numeric(10,2) NOT NULL DEFAULT 0,
            "dailyUsed" integer NOT NULL DEFAULT 0,
            "lastDayCalculated" character varying,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "UQ_monthly_budget_states_sourceKey_monthKey" UNIQUE ("sourceKey", "monthKey"),
            CONSTRAINT "PK_monthly_budget_states_id" PRIMARY KEY ("id")
        )`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop monthly_budget_states table
        await queryRunner.query(`DROP TABLE "monthly_budget_states"`);

        // Remove new columns from rate_budget_windows
        await queryRunner.query(`ALTER TABLE "rate_budget_windows" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "rate_budget_windows" DROP COLUMN "tier"`);
        await queryRunner.query(`ALTER TABLE "rate_budget_windows" DROP COLUMN "budgetType"`);
    }
}
