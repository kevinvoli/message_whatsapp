import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase7AiGovernance1745286400001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS \`ai_module_config\` (
        \`module_name\`              VARCHAR(50)   NOT NULL,
        \`is_enabled\`               TINYINT(1)    NOT NULL DEFAULT 0,
        \`fallback_text\`            TEXT          NULL,
        \`requires_human_validation\` TINYINT(1)   NOT NULL DEFAULT 0,
        \`schedule_start\`           VARCHAR(5)    NULL,
        \`schedule_end\`             VARCHAR(5)    NULL,
        \`allowed_roles\`            JSON          NULL,
        \`allowed_channels\`         JSON          NULL,
        \`security_rules\`           JSON          NULL,
        \`created_at\`               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`module_name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS \`ai_execution_log\` (
        \`id\`                       CHAR(36)      NOT NULL,
        \`module_name\`              VARCHAR(50)   NOT NULL,
        \`scenario\`                 VARCHAR(100)  NULL,
        \`triggered_by\`             VARCHAR(100)  NULL,
        \`chat_id\`                  CHAR(36)      NULL,
        \`channel_id\`               VARCHAR(36)   NULL,
        \`success\`                  TINYINT(1)    NOT NULL DEFAULT 1,
        \`latency_ms\`               INT           NOT NULL DEFAULT 0,
        \`fallback_used\`            TINYINT(1)    NOT NULL DEFAULT 0,
        \`human_validation_used\`    TINYINT(1)    NOT NULL DEFAULT 0,
        \`error_message\`            TEXT          NULL,
        \`tokens_used\`              INT           NULL,
        \`created_at\`               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_ai_exec_module_time\` (\`module_name\`, \`created_at\`),
        INDEX \`IDX_ai_exec_triggered_by\` (\`triggered_by\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS \`ai_execution_log\``);
    await qr.query(`DROP TABLE IF EXISTS \`ai_module_config\``);
  }
}
