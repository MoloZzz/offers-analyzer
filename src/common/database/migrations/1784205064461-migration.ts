import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784205064461 implements MigrationInterface {
    name = 'Migration1784205064461'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."average_price_snapshots_currency_enum" AS ENUM('USD', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "average_price_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceKey" character varying NOT NULL DEFAULT 'auto-ria', "cohortKey" character varying NOT NULL, "value" numeric NOT NULL, "currency" "public"."average_price_snapshots_currency_enum" NOT NULL, "sampleSize" integer NOT NULL, "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b62ddb2d50834c55d77b7fab4c2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5b03f6fd2405bdec0fb41b4ff1" ON "average_price_snapshots" ("cohortKey", "capturedAt") `);
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT '0.3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT 0.3`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5b03f6fd2405bdec0fb41b4ff1"`);
        await queryRunner.query(`DROP TABLE "average_price_snapshots"`);
        await queryRunner.query(`DROP TYPE "public"."average_price_snapshots_currency_enum"`);
    }

}
