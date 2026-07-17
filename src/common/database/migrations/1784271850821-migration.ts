import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784271850821 implements MigrationInterface {
    name = 'Migration1784271850821'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "listings" ADD "description" text`);
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT '0.3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_profiles" ALTER COLUMN "minDealScore" SET DEFAULT 0.3`);
        await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "description"`);
    }

}
