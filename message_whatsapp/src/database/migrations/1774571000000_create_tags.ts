import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTags1774571000000 implements MigrationInterface {
  name = 'CreateTags1774571000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tag\` (
        \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
        \`tenant_id\` CHAR(36) NULL,
        \`name\` VARCHAR(50) NOT NULL,
        \`color\` VARCHAR(20) NOT NULL DEFAULT '#6b7280',
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_tag_tenant\` (\`tenant_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`chat_tag\` (
        \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
        \`chat_id\` VARCHAR(100) NOT NULL,
        \`tag_id\` CHAR(36) NOT NULL,
        \`tenant_id\` CHAR(36) NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_chat_tag\` (\`chat_id\`, \`tag_id\`),
        KEY \`IDX_chat_tag_chat_id\` (\`chat_id\`),
        CONSTRAINT \`FK_chat_tag_tag\` FOREIGN KEY (\`tag_id\`) REFERENCES \`tag\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`chat_tag\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`tag\``);
  }
}
