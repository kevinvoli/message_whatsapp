import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds quoted_message_id column to whatsapp_message for the reply-to-message feature.
 * - Self-referential FK to whatsapp_message.id (ON DELETE SET NULL)
 * - Nullable: most messages are not replies
 */
export class AddQuotedMessageId1740909600000 implements MigrationInterface {
  name = 'AddQuotedMessageId1740909600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whatsapp_message');
    if (!table) return;

    const hasColumn = table.columns.some((c) => c.name === 'quoted_message_id');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\`
         ADD COLUMN \`quoted_message_id\` char(36) NULL`,
      );
    }

    // Add FK only if it doesn't exist yet
    const rows: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA        = DATABASE()
         AND TABLE_NAME          = 'whatsapp_message'
         AND COLUMN_NAME         = 'quoted_message_id'
         AND REFERENCED_TABLE_NAME = 'whatsapp_message'
       LIMIT 1`,
    );

    if (!rows.length) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\`
         ADD CONSTRAINT \`FK_whatsapp_message_quoted\`
         FOREIGN KEY (\`quoted_message_id\`)
         REFERENCES \`whatsapp_message\`(\`id\`)
         ON DELETE SET NULL
         ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA        = DATABASE()
         AND TABLE_NAME          = 'whatsapp_message'
         AND COLUMN_NAME         = 'quoted_message_id'
         AND REFERENCED_TABLE_NAME = 'whatsapp_message'
       LIMIT 1`,
    );

    if (rows.length) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP FOREIGN KEY \`${rows[0].CONSTRAINT_NAME}\``,
      );
    }

    const table = await queryRunner.getTable('whatsapp_message');
    if (table?.columns.some((c) => c.name === 'quoted_message_id')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`quoted_message_id\``,
      );
    }
  }
}
