import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCannedResponses20260326 implements MigrationInterface {
  name = 'CreateCannedResponses20260326';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`canned_responses\` (
        \`id\`         CHAR(36)      NOT NULL DEFAULT (UUID()),
        \`tenant_id\`  CHAR(36)      NULL,
        \`shortcut\`   VARCHAR(64)   NOT NULL,
        \`title\`      VARCHAR(128)  NOT NULL,
        \`content\`    TEXT          NOT NULL,
        \`category\`   VARCHAR(64)   NULL,
        \`createdAt\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_canned_tenant_shortcut\` (\`tenant_id\`, \`shortcut\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`canned_responses\``);
  }
}
