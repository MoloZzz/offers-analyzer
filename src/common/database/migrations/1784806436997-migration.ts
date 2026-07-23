import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784806436997 implements MigrationInterface {
    name = 'Migration1784806436997'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "listing_disappearances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "listingId" uuid NOT NULL, "cohortKey" character varying, "lastKnownPriceUsd" numeric NOT NULL, "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "disappearedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "domDays" integer NOT NULL, "priceCutsCount" integer NOT NULL, "hadPriceCut" boolean NOT NULL, "isRelist" boolean NOT NULL DEFAULT false, "relistListingId" uuid, "relistDetectedAt" TIMESTAMP WITH TIME ZONE, "reappearedAt" TIMESTAMP WITH TIME ZONE, "detectionMode" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_listing_disappearances_listingId" UNIQUE ("listingId"), CONSTRAINT "PK_1c98d2195348a1eb036299fef66" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_listing_disappearances_disappearedAt" ON "listing_disappearances" ("disappearedAt") `);
        await queryRunner.query(`ALTER TABLE "listings" ADD "lastSeenInSearchAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`UPDATE "listings" SET "lastSeenInSearchAt" = "lastSeenAt"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "lastSeenInSearchAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_listing_disappearances_disappearedAt"`);
        await queryRunner.query(`DROP TABLE "listing_disappearances"`);
    }

}
