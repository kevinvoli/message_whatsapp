import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversationTransfers1774570000000 implements MigrationInterface {
  name = 'CreateConversationTransfers1774570000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`conversation_transfers\` (
        \`id\`             CHAR(36)      NOT NULL DEFAULT (UUID()),
        \`chat_id\`        VARCHAR(100)  NOT NULL,
        \`tenant_id\`      CHAR(36)      NULL,
        \`from_poste_id\`  CHAR(36)      NULL,
        \`to_poste_id\`    CHAR(36)      NOT NULL,
        \`transferred_by\` CHAR(36)      NULL,
        \`reason\`         TEXT          NULL,
        \`transferred_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_transfer_chat\` (\`chat_id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`conversation_transfers\``);
  }
}
