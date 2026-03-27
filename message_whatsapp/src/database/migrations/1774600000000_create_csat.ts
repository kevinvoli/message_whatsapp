import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCsat1774600000000 implements MigrationInterface {
  name = 'CreateCsat1774600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Table csat_responses
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`csat_responses\` (
        \`id\`            CHAR(36)      NOT NULL DEFAULT (UUID()),
        \`chat_id\`       VARCHAR(100)  NOT NULL,
        \`tenant_id\`     CHAR(36)      NULL,
        \`commercial_id\` CHAR(36)      NULL,
        \`score\`         TINYINT       NOT NULL,
        \`responded_at\`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_csat_chat_id\` (\`chat_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Colonne csat_sent_at sur whatsapp_chat
    const [existing] = await queryRunner.query(
      `SHOW COLUMNS FROM \`whatsapp_chat\` WHERE Field = 'csat_sent_at'`,
    );
    if (!existing) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`csat_sent_at\` TIMESTAMP NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`csat_responses\``);

    const [existing] = await queryRunner.query(
      `SHOW COLUMNS FROM \`whatsapp_chat\` WHERE Field = 'csat_sent_at'`,
    );
    if (existing) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`csat_sent_at\``,
      );
    }
  }
}
