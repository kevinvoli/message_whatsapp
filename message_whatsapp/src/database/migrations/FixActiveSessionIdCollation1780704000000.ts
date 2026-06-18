import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixActiveSessionIdCollation1780704000000 implements MigrationInterface {
  name = 'FixActiveSessionIdCollation1780704000000';

  public async up(qr: QueryRunner): Promise<void> {
    // La colonne active_session_id a été ajoutée sans collation explicite dans
    // AddChatSessionEntity1780531200000, elle hérite donc de la collation de
    // whatsapp_chat (utf8mb4_general_ci). La table chat_session utilise
    // utf8mb4_unicode_ci, ce qui provoque ER_CANT_AGGREGATE_2COLLATIONS sur
    // la condition `c.active_session_id = s.id` du cron read-only-enforcement.
    await qr.query(`
      ALTER TABLE \`whatsapp_chat\`
      MODIFY COLUMN \`active_session_id\` CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        NULL DEFAULT NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE \`whatsapp_chat\`
      MODIFY COLUMN \`active_session_id\` CHAR(36)
        NULL DEFAULT NULL
    `);
  }
}
