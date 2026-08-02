import { MigrationInterface, QueryRunner } from 'typeorm';

export class TelegramMonitoringControl1785320000000 implements MigrationInterface {
  name = 'TelegramMonitoringControl1785320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "source_controls" (
      "sourceKey" character varying NOT NULL,
      "dailyLimitEnabled" boolean NOT NULL DEFAULT true,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_source_controls_sourceKey" PRIMARY KEY ("sourceKey")
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "source_controls"`);
  }
}
