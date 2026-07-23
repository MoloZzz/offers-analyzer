import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784830958818 implements MigrationInterface {
    name = 'Migration1784830958818'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "deal_outcomes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "listingId" uuid NOT NULL, "opportunityId" uuid, "stage" character varying NOT NULL, "declineReason" character varying, "buyPriceUsd" numeric, "actualCostsUsd" numeric, "sellPriceUsd" numeric, "daysOnMarket" integer, "boughtAt" TIMESTAMP WITH TIME ZONE, "soldAt" TIMESTAMP WITH TIME ZONE, "lastRemindedAt" TIMESTAMP WITH TIME ZONE, "note" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_deal_outcomes_listingId" UNIQUE ("listingId"), CONSTRAINT "PK_405c8f7d856168a9c3bce6d2ff1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_deal_outcomes_stage" ON "deal_outcomes" ("stage") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_deal_outcomes_stage"`);
        await queryRunner.query(`DROP TABLE "deal_outcomes"`);
    }

}
