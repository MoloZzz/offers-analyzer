import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784284549088 implements MigrationInterface {
    name = 'Migration1784284549088'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "parameter_sets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "version" integer NOT NULL, "active" boolean NOT NULL DEFAULT false, "origin" character varying NOT NULL DEFAULT 'manual', "reason" text, "params" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9f4526f5a0d3c7c50a9f5c73a19" UNIQUE ("version"), CONSTRAINT "PK_9c34a2ec73d6e067e08c7a5c2c0" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "parameter_sets"`);
    }

}
