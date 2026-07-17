import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784289182080 implements MigrationInterface {
    name = 'Migration1784289182080'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "outcomes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "listingId" uuid NOT NULL, "opportunityId" uuid, "source" character varying NOT NULL, "label" character varying NOT NULL, "value" numeric, "note" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9d3e6199231ec06a637b0d2a72a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_outcomes_listingId" ON "outcomes" ("listingId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_outcomes_listingId"`);
        await queryRunner.query(`DROP TABLE "outcomes"`);
    }

}
