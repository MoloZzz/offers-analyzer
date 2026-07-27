import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpportunitySampleSize1785200000000 implements MigrationInterface {
  name = 'AddOpportunitySampleSize1785200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD "sampleSize" integer NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN "sampleSize"`);
  }
}
