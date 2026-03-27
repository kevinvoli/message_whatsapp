import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralToWhatsappChat20260326 implements MigrationInterface {
  name = 'AddReferralToWhatsappChat20260326';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whatsapp_chat');
    if (!table) return;

    const cols = table.columns.map((c) => c.name);

    if (!cols.includes('referral_source_type')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`referral_source_type\` VARCHAR(32) NULL`,
      );
    }
    if (!cols.includes('referral_source_id')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`referral_source_id\` VARCHAR(128) NULL`,
      );
    }
    if (!cols.includes('referral_headline')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`referral_headline\` VARCHAR(255) NULL`,
      );
    }
    if (!cols.includes('referral_source_url')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`referral_source_url\` TEXT NULL`,
      );
    }
    if (!cols.includes('referral_ctwa_clid')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`referral_ctwa_clid\` VARCHAR(128) NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP COLUMN IF EXISTS \`referral_ctwa_clid\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP COLUMN IF EXISTS \`referral_source_url\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP COLUMN IF EXISTS \`referral_headline\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP COLUMN IF EXISTS \`referral_source_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP COLUMN IF EXISTS \`referral_source_type\``,
    );
  }
}
