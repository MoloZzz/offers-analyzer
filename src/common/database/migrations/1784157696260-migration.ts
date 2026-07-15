import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784157696260 implements MigrationInterface {
    name = 'Migration1784157696260'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "listings" ADD "lastScore" numeric`);
        await queryRunner.query(`ALTER TABLE "listings" ADD "lastDiscountPct" numeric`);
        await queryRunner.query(`ALTER TABLE "listings" ADD "lastEvaluatedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT '0.3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT 0.3`);
        await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "lastEvaluatedAt"`);
        await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "lastDiscountPct"`);
        await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "lastScore"`);
    }

}
