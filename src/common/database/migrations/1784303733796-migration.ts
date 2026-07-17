import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784303733796 implements MigrationInterface {
    name = 'Migration1784303733796'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "listings" ADD "profileId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "profileId"`);
    }

}
