import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialPhone1745500000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // whatsapp_commercial pre-dates migrations — use raw SQL to avoid TypeORM cache issues
    if (!(await qr.hasColumn('whatsapp_commercial', 'phone'))) {
      await qr.query('ALTER TABLE `whatsapp_commercial` ADD COLUMN `phone` VARCHAR(50) NULL DEFAULT NULL');
      await qr.query('CREATE UNIQUE INDEX `IDX_commercial_phone` ON `whatsapp_commercial` (`phone`)');
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('whatsapp_commercial', 'phone')) {
      await qr.query('DROP INDEX `IDX_commercial_phone` ON `whatsapp_commercial`');
      await qr.query('ALTER TABLE `whatsapp_commercial` DROP COLUMN `phone`');
    }
  }
}
