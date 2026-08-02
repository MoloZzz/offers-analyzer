import { MigrationInterface, QueryRunner } from 'typeorm';

/** Converts the pre-release source-pause column if SPEC-014 was deployed from an earlier build. */
export class DailyLimitControlCompat1785321000000 implements MigrationInterface {
  name = 'DailyLimitControlCompat1785321000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'source_controls' AND column_name = 'paused'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'source_controls' AND column_name = 'dailyLimitEnabled'
        ) THEN
          ALTER TABLE "source_controls" ADD COLUMN "dailyLimitEnabled" boolean NOT NULL DEFAULT true;
          UPDATE "source_controls" SET "dailyLimitEnabled" = NOT "paused";
          ALTER TABLE "source_controls" DROP COLUMN "paused";
        END IF;
      END
    $$`);
  }

  public async down(): Promise<void> {
    // Compatibility migration is intentionally irreversible; the new column is the source of truth.
  }
}
