import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactSourceToContact1747009000001 implements MigrationInterface {
  name = 'AddContactSourceToContact1747009000001';

  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('contact', 'contact_source'))) {
      await qr.query(
        `ALTER TABLE contact ADD COLUMN contact_source ENUM('whatsapp', 'erp_import') NOT NULL DEFAULT 'whatsapp'`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('contact', 'contact_source')) {
      await qr.query(`ALTER TABLE contact DROP COLUMN contact_source`);
    }
  }
}
