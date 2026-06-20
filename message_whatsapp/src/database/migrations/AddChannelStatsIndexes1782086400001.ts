import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelStatsIndexes1782086400001 implements MigrationInterface {
  name = 'AddChannelStatsIndexes1782086400001';
  // transaction = false : évite le START TRANSACTION de TypeORM qui force un lock
  // de table complet sur MariaDB et rend le CREATE INDEX non-bloquant (online DDL)
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    const chatIdx = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'whatsapp_chat'
        AND INDEX_NAME   = 'IDX_chat_channel_activity'
    `);
    if (parseInt(chatIdx[0].cnt, 10) === 0) {
      // ALTER TABLE + ALGORITHM=INPLACE LOCK=NONE : online DDL MariaDB — échoue
      // immédiatement si un MDL lock est détenu (plutôt que d'attendre indéfiniment)
      await queryRunner.query(
        'ALTER TABLE `whatsapp_chat` ADD INDEX `IDX_chat_channel_activity` (`channel_id`, `last_activity_at`, `deletedAt`) ALGORITHM=INPLACE, LOCK=NONE',
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
        'ALTER TABLE `whatsapp_message` ADD INDEX `IDX_msg_channel_time` (`channel_id`, `createdAt`, `deletedAt`) ALGORITHM=INPLACE, LOCK=NONE',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_channel_activity\` ON \`whatsapp_chat\``);
    await queryRunner.query(`DROP INDEX \`IDX_msg_channel_time\` ON \`whatsapp_message\``);
  }
}
