import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerWindowExpiresAt1778093500481 implements MigrationInterface {
  name = 'AddCustomerWindowExpiresAt1778093500481';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'whatsapp_chat';

    const hasColumn = await queryRunner.hasColumn(table, 'customer_window_expires_at');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`customer_window_expires_at\` DATETIME NULL`,
      );
    }

    const hasIndex = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = '${table}'
         AND INDEX_NAME = 'IDX_chat_window_expires'`,
    );
    if (hasIndex[0].cnt === 0) {
      await queryRunner.query(
        `CREATE INDEX \`IDX_chat_window_expires\` ON \`${table}\` (\`customer_window_expires_at\`)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'whatsapp_chat';
    await queryRunner.query(
      `DROP INDEX IF EXISTS \`IDX_chat_window_expires\` ON \`${table}\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`customer_window_expires_at\``,
    );
  }
}
