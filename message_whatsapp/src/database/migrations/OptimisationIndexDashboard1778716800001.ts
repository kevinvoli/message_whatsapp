import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexDashboard1778716800001 implements MigrationInterface {
  name = 'OptimisationIndexDashboard1778716800001';

  private async addIndexIfMissing(
    qr: QueryRunner,
    table: string,
    index: string,
    columns: string,
  ): Promise<void> {
    const rows = await qr.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, index],
    );
    if (parseInt(rows[0]?.cnt ?? '0', 10) === 0) {
      await qr.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.addIndexIfMissing(
      queryRunner, 'call_log', 'IDX_call_log_commercial_createdat',
      '`commercial_id`, `createdAt`',
    );
    await this.addIndexIfMissing(
      queryRunner, 'follow_up', 'IDX_follow_up_commercial_status_completed',
      '`commercial_id`, `status`, `completed_at`',
    );
    await this.addIndexIfMissing(
      queryRunner, 'whatsapp_chat', 'IDX_chat_conversation_result',
      '`conversation_result`, `deletedAt`',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`call_log\` DROP INDEX IF EXISTS \`IDX_call_log_commercial_createdat\``);
    await queryRunner.query(`ALTER TABLE \`follow_up\` DROP INDEX IF EXISTS \`IDX_follow_up_commercial_status_completed\``);
    await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP INDEX IF EXISTS \`IDX_chat_conversation_result\``);
  }
}
