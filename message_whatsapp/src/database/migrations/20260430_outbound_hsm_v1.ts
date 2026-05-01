import { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboundHsm1746000000001 implements MigrationInterface {
  name = 'OutboundHsm1746000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`whatsapp_template\``);
    await queryRunner.query(`
      CREATE TABLE \`whatsapp_template\` (
        \`id\`               varchar(36)  NOT NULL,
        \`channel_id\`       varchar(36)  NOT NULL,
        \`name\`             varchar(100) NOT NULL,
        \`language\`         varchar(10)  NOT NULL DEFAULT 'fr',
        \`category\`         varchar(50)  NULL,
        \`status\`           enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        \`components\`       json         NULL,
        \`external_id\`      varchar(191) NULL,
        \`rejection_reason\` varchar(500) NULL,
        \`created_at\`       datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`       datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_whatsapp_template_channel_id\` (\`channel_id\`),
        INDEX \`IDX_whatsapp_template_channel_status\` (\`channel_id\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`whatsapp_template\``);
  }
}
