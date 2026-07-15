import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784156800309 implements MigrationInterface {
    name = 'Migration1784156800309'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."listings_currentcurrency_enum" AS ENUM('USD', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "listings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceKey" character varying NOT NULL DEFAULT 'auto-ria', "externalId" character varying NOT NULL, "make" character varying NOT NULL, "model" character varying NOT NULL, "markId" integer, "modelId" integer, "year" integer NOT NULL, "mileage" integer, "stateId" integer, "cityId" integer, "sellerType" character varying NOT NULL DEFAULT 'unknown', "vin" character varying, "url" character varying NOT NULL, "currentAmount" numeric NOT NULL, "currentCurrency" "public"."listings_currentcurrency_enum" NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_25b0d2a2f5ea4d47e58fb50098f" UNIQUE ("sourceKey", "externalId"), CONSTRAINT "PK_520ecac6c99ec90bcf5a603cdcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_78b62ad8a47355be2e7f7c8f04" ON "listings" ("make", "model", "year", "stateId") `);
        await queryRunner.query(`CREATE TYPE "public"."price_observations_currency_enum" AS ENUM('USD', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "price_observations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "listingId" uuid NOT NULL, "amount" numeric NOT NULL, "currency" "public"."price_observations_currency_enum" NOT NULL, "amountUsd" numeric NOT NULL, "observedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e6c673b1a567075d17a300a7f71" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f8a3d9582fc1deed5b17053e88" ON "price_observations" ("listingId", "observedAt") `);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subscriberId" uuid NOT NULL, "opportunityId" uuid NOT NULL, "type" character varying NOT NULL, "dedupKey" character varying NOT NULL, "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_89912737df811debbaab3c5a5f2" UNIQUE ("dedupKey"), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "subscribers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "telegramChatId" character varying NOT NULL, "state" character varying NOT NULL DEFAULT 'active', "profileIds" uuid array, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_7b7acc6ad10d30685fe5847dc00" UNIQUE ("telegramChatId"), CONSTRAINT "PK_cbe0a7a9256c826f403c0236b67" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."search_profiles_currency_enum" AS ENUM('USD', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "search_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "sourceKey" character varying NOT NULL DEFAULT 'auto-ria', "categoryId" integer NOT NULL, "stateId" integer, "cityId" integer, "filters" jsonb NOT NULL, "priceFrom" integer, "priceTo" integer, "currency" "public"."search_profiles_currency_enum" NOT NULL DEFAULT 'USD', "minDealScore" numeric(4,3) NOT NULL DEFAULT '0.3', "confidenceMinSamples" integer NOT NULL, "dealerPolicy" character varying NOT NULL DEFAULT 'label', "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_79b8fdf6b0328671778f53ec84b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."fair_value_benchmarks_currency_enum" AS ENUM('USD', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "fair_value_benchmarks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceKey" character varying NOT NULL DEFAULT 'auto-ria', "cohortKey" character varying NOT NULL, "value" numeric NOT NULL, "currency" "public"."fair_value_benchmarks_currency_enum" NOT NULL, "sampleSize" integer NOT NULL, "computedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_f9cec9510ff7e6bba50c2c8125c" UNIQUE ("sourceKey", "cohortKey"), CONSTRAINT "PK_b1bb659a19ed2d7eacfc6c95ea1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."opportunities_currency_enum" AS ENUM('USD', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "opportunities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "listingId" uuid NOT NULL, "profileId" uuid NOT NULL, "fairValue" numeric NOT NULL, "currency" "public"."opportunities_currency_enum" NOT NULL, "askingValue" numeric NOT NULL, "discountPct" numeric NOT NULL, "confidence" numeric NOT NULL, "score" numeric NOT NULL, "redFlags" jsonb NOT NULL DEFAULT '{}', "notified" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4bd9cd12ddc0ff48a5a97ddebce" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c38aaa05c02d55280ccb5049e7" ON "opportunities" ("profileId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "price_observations" ADD CONSTRAINT "FK_702eda8663a5b47ac6b0279a4e0" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "price_observations" DROP CONSTRAINT "FK_702eda8663a5b47ac6b0279a4e0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c38aaa05c02d55280ccb5049e7"`);
        await queryRunner.query(`DROP TABLE "opportunities"`);
        await queryRunner.query(`DROP TYPE "public"."opportunities_currency_enum"`);
        await queryRunner.query(`DROP TABLE "fair_value_benchmarks"`);
        await queryRunner.query(`DROP TYPE "public"."fair_value_benchmarks_currency_enum"`);
        await queryRunner.query(`DROP TABLE "search_profiles"`);
        await queryRunner.query(`DROP TYPE "public"."search_profiles_currency_enum"`);
        await queryRunner.query(`DROP TABLE "subscribers"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f8a3d9582fc1deed5b17053e88"`);
        await queryRunner.query(`DROP TABLE "price_observations"`);
        await queryRunner.query(`DROP TYPE "public"."price_observations_currency_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_78b62ad8a47355be2e7f7c8f04"`);
        await queryRunner.query(`DROP TABLE "listings"`);
        await queryRunner.query(`DROP TYPE "public"."listings_currentcurrency_enum"`);
    }

}
