import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminAuditLog1751700000001 implements MigrationInterface {
  name = 'AdminAuditLog1751700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`admin_audit_log\` (
        \`id\`            VARCHAR(36)   NOT NULL,
        \`admin_id\`      VARCHAR(36)   NOT NULL,
        \`action\`        VARCHAR(100)  NOT NULL,
        \`payload\`       JSON          NOT NULL,
        \`target_id\`     VARCHAR(36)   NULL,
        \`target_entity\` VARCHAR(100)  NOT NULL,
        \`createdAt\`     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_audit_admin_id\`   (\`admin_id\`),
        INDEX \`idx_audit_action\`     (\`action\`),
        INDEX \`idx_audit_created_at\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `admin_audit_log`');
  }
}
