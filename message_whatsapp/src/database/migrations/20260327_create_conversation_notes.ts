import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversationNotes20260327 implements MigrationInterface {
  name = 'CreateConversationNotes20260327';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`conversation_notes\` (
        \`id\`          CHAR(36)      NOT NULL DEFAULT (UUID()),
        \`chat_id\`     VARCHAR(100)  NOT NULL,
        \`author_id\`   CHAR(36)      NOT NULL,
        \`author_name\` VARCHAR(128)  NULL,
        \`author_type\` ENUM('commercial', 'admin') NOT NULL DEFAULT 'commercial',
        \`content\`     TEXT          NOT NULL,
        \`createdAt\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`   DATETIME      NULL,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_notes_chat\` (\`chat_id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`conversation_notes\``);
  }
}
