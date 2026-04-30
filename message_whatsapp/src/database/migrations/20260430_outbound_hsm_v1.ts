import { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboundHsm1746000000001 implements MigrationInterface {
  name = 'OutboundHsm1746000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_template\` (
        \`id\`               varchar(36)  NOT NULL,
        \`tenant_id\`        varchar(36)  NULL,
        \`channel_id\`       varchar(100) NULL,
        \`name\`             varchar(255) NOT NULL,
        \`meta_template_id\` varchar(100) NULL,
        \`category\`         varchar(50)  NOT NULL,
        \`language\`         varchar(10)  NOT NULL DEFAULT 'fr',
        \`status\`           varchar(20)  NOT NULL DEFAULT 'PENDING',
        \`header_type\`      varchar(50)  NULL,
        \`header_content\`   text         NULL,
        \`body_text\`        text         NOT NULL,
        \`footer_text\`      varchar(255) NULL,
        \`buttons\`          json         NULL,
        \`rejection_reason\` text         NULL,
        \`created_at\`       datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`       datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`       datetime(6)  NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
    `);
    await queryRunner.query(
      `CREATE INDEX \`IDX_template_tenant\` ON \`whatsapp_template\` (\`tenant_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_template_status\` ON \`whatsapp_template\` (\`status\`)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`whatsapp_template\``);
  }
}
