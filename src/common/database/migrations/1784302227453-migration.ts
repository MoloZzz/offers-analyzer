import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784302227453 implements MigrationInterface {
    name = 'Migration1784302227453'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "calibration_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ranAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "capability" character varying NOT NULL DEFAULT 'threshold', "mode" character varying NOT NULL DEFAULT 'propose', "inputsSummary" jsonb NOT NULL, "proposal" jsonb, "applied" boolean NOT NULL DEFAULT false, "reason" text NOT NULL, CONSTRAINT "PK_calibration_runs_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "calibration_runs"`);
    }

}
