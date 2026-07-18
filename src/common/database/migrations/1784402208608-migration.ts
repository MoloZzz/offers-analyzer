import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784402208608 implements MigrationInterface {
    name = 'Migration1784402208608'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "alerted_cars" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "carKey" character varying NOT NULL, "lowestAlertedUsd" numeric NOT NULL, "lastListingId" uuid, "lastAlertedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_alerted_cars_carKey" UNIQUE ("carKey"), CONSTRAINT "PK_alerted_cars" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "alerted_cars"`);
    }

}
