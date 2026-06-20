import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelStatsIndexes1782086400001 implements MigrationInterface {
  name = 'AddChannelStatsIndexes1782086400001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const chatIdx = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'whatsapp_chat'
        AND INDEX_NAME   = 'IDX_chat_channel_activity'
    `);
    if (parseInt(chatIdx[0].cnt, 10) === 0) {
      await queryRunner.query(
        'CREATE INDEX `IDX_chat_channel_activity` ON `whatsapp_chat` (`channel_id`, `last_activity_at`, `deletedAt`)',
      );
    }

    const msgIdx = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'whatsapp_message'
        AND INDEX_NAME   = 'IDX_msg_channel_time'
    `);
    if (parseInt(msgIdx[0].cnt, 10) === 0) {
      await queryRunner.query(
        'CREATE INDEX `IDX_msg_channel_time` ON `whatsapp_message` (`channel_id`, `createdAt`, `deletedAt`)',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_channel_activity\` ON \`whatsapp_chat\``);
    await queryRunner.query(`DROP INDEX \`IDX_msg_channel_time\` ON \`whatsapp_message\``);
  }
}
