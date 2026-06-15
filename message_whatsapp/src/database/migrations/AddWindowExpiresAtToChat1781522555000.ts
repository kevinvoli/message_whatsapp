import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWindowExpiresAtToChat1781522555000
  implements MigrationInterface
{
  name = 'AddWindowExpiresAtToChat1781522555000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_chat'))) return;

    const hasColumn = await queryRunner.hasColumn('whatsapp_chat', 'window_expires_at');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\`
           ADD COLUMN \`window_expires_at\` TIMESTAMP NULL DEFAULT NULL`,
      );
    }

    if (await queryRunner.hasTable('chat_session')) {
      await queryRunner.query(
        `UPDATE \`whatsapp_chat\` c
           JOIN \`chat_session\` s ON s.id = c.active_session_id
           SET c.window_expires_at = s.auto_close_at
           WHERE s.ended_at IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_chat'))) return;

    const hasColumn = await queryRunner.hasColumn('whatsapp_chat', 'window_expires_at');
    if (hasColumn) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`window_expires_at\``,
      );
    }
  }
}
