import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommercialGroup1747094400002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const tableExists = await qr.hasTable('commercial_group');
    if (!tableExists) {
      await qr.query(`
        CREATE TABLE commercial_group (
          id          CHAR(36)     NOT NULL PRIMARY KEY,
          name        VARCHAR(100) NOT NULL UNIQUE,
          description VARCHAR(255) NULL,
          is_active   TINYINT(1)   NOT NULL DEFAULT 1,
          created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX IDX_commercial_group_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    const hasGroupId = await qr.hasColumn('whatsapp_commercial', 'group_id');
    if (!hasGroupId) {
      await qr.query(`
        ALTER TABLE whatsapp_commercial
          ADD COLUMN group_id VARCHAR(36) NULL DEFAULT NULL,
          ADD INDEX  IDX_commercial_group_id (group_id)
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasGroupId = await qr.hasColumn('whatsapp_commercial', 'group_id');
    if (hasGroupId) {
      await qr.query(`ALTER TABLE whatsapp_commercial DROP INDEX IDX_commercial_group_id`);
      await qr.query(`ALTER TABLE whatsapp_commercial DROP COLUMN group_id`);
    }
    await qr.query(`DROP TABLE IF EXISTS commercial_group`);
  }
}
