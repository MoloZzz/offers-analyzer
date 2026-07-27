import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvaluationExplanation1785261600000 implements MigrationInterface {
  name = 'AddEvaluationExplanation1785261600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "listings" ADD "lastExplanation" jsonb`);
    await queryRunner.query(`ALTER TABLE "opportunities" ADD "explanation" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN "explanation"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "lastExplanation"`);
  }
}
