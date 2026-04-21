import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4ContactReferral1745200000010 implements MigrationInterface {
  name = 'Phase4ContactReferral1745200000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`contact\`
        ADD COLUMN IF NOT EXISTS \`certified_at\`        TIMESTAMP     NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS \`referral_code\`       VARCHAR(50)   NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS \`referral_count\`      INT           NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS \`referral_commission\` DECIMAL(12,2) NULL DEFAULT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`contact\`
        DROP COLUMN IF EXISTS \`certified_at\`,
        DROP COLUMN IF EXISTS \`referral_code\`,
        DROP COLUMN IF EXISTS \`referral_count\`,
        DROP COLUMN IF EXISTS \`referral_commission\`
    `);
  }
}
