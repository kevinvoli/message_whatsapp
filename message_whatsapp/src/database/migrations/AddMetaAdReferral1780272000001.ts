import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaAdReferral1780272000001 implements MigrationInterface {
  name = 'AddMetaAdReferral1780272000001';

  private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    ) as Array<{ cnt: number }>;
    return Number(row.cnt) > 0;
  }

  private async addCol(qr: QueryRunner, table: string, col: string, def: string): Promise<void> {
    if (!(await this.columnExists(qr, table, col))) {
      await qr.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
    }
  }

  private async indexExists(qr: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await qr.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasTable('meta_ad_referral'))) {
      await qr.query(`
        CREATE TABLE \`meta_ad_referral\` (
          \`id\`          CHAR(36)      NOT NULL,
          \`chat_id\`     CHAR(36)      NOT NULL,
          \`source_url\`  VARCHAR(2048) NULL,
          \`source_type\` VARCHAR(50)   NOT NULL,
          \`source_id\`   VARCHAR(255)  NOT NULL,
          \`headline\`    VARCHAR(512)  NULL,
          \`body\`        TEXT          NULL,
          \`media_type\`  VARCHAR(50)   NULL,
          \`image_url\`   VARCHAR(2048) NULL,
          \`ctwa_clid\`   VARCHAR(512)  NULL,
          \`created_at\`  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_meta_ad_referral_chat_id\` (\`chat_id\`),
          INDEX \`IDX_meta_ad_referral_source_id\` (\`source_id\`),
          CONSTRAINT \`FK_meta_ad_referral_chat\`
            FOREIGN KEY (\`chat_id\`) REFERENCES \`whatsapp_chat\` (\`id\`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    await this.addCol(qr, 'whatsapp_chat', 'is_ctwa', 'TINYINT(1) NOT NULL DEFAULT 0');

    if (!(await this.indexExists(qr, 'whatsapp_chat', 'IDX_chat_is_ctwa'))) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` ADD INDEX \`IDX_chat_is_ctwa\` (\`is_ctwa\`)`);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.indexExists(qr, 'whatsapp_chat', 'IDX_chat_is_ctwa')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_is_ctwa\``);
    }
    if (await this.columnExists(qr, 'whatsapp_chat', 'is_ctwa')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`is_ctwa\``);
    }
    if (await qr.hasTable('meta_ad_referral')) {
      await qr.query(`DROP TABLE \`meta_ad_referral\``);
    }
  }
}
