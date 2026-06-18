import { MigrationInterface, QueryRunner } from 'typeorm';

export class PosteNumero1745856000004 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // whatsapp_poste pre-dates migrations — use raw SQL to avoid TypeORM cache issues
    if (await qr.hasColumn('whatsapp_poste', 'numero_poste')) return;
    await qr.query('ALTER TABLE `whatsapp_poste` ADD COLUMN `numero_poste` INT NULL DEFAULT NULL');
    await qr.query('ALTER TABLE `whatsapp_poste` ADD UNIQUE INDEX `UQ_poste_numero_poste` (`numero_poste`)');
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('whatsapp_poste', 'numero_poste')) {
      await qr.query('ALTER TABLE `whatsapp_poste` DROP COLUMN `numero_poste`');
    }
  }
}
