import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784304020857 implements MigrationInterface {
    name = 'Migration1784304020857'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "calibration_runs" ADD "profileId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "calibration_runs" DROP COLUMN "profileId"`);
    }

}
