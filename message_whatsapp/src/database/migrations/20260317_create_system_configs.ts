import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemConfigs1774051200000 implements MigrationInterface {
  name = 'CreateSystemConfigs1774051200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`system_configs\` (
        \`id\`           CHAR(36)      NOT NULL,
        \`config_key\`   VARCHAR(100)  NOT NULL,
        \`config_value\` TEXT          NULL,
        \`category\`     VARCHAR(50)   NOT NULL DEFAULT 'general',
        \`label\`        VARCHAR(200)  NULL,
        \`description\`  TEXT          NULL,
        \`is_secret\`    TINYINT(1)    NOT NULL DEFAULT 0,
        \`is_readonly\`  TINYINT(1)    NOT NULL DEFAULT 0,
        \`created_at\`   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_system_config_key\` (\`config_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`system_configs\``);
  }
}
