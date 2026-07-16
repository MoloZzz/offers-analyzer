import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784199607079 implements MigrationInterface {
    name = 'Migration1784199607079'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "rate_budget_windows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceKey" character varying NOT NULL, "windowKey" character varying NOT NULL, "used" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_df1e68785f3016608a9bd82c134" UNIQUE ("sourceKey", "windowKey"), CONSTRAINT "PK_8bed3ab5a2c739862e2d5ca0ddd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT '0.3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT 0.3`);
        await queryRunner.query(`DROP TABLE "rate_budget_windows"`);
    }

}
