import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanningAudit1779321600001 implements MigrationInterface {
  name = 'AddPlanningAudit1779321600001';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS \`commercial_planning_audit\` (
        \`id\`             VARCHAR(36)                      NOT NULL,
        \`planning_id\`    VARCHAR(36)                      NULL,
        \`action\`         ENUM('created','deleted')        NOT NULL,
        \`commercial_id\`  VARCHAR(36)                      NOT NULL,
        \`type\`           ENUM('absence','exceptional')    NOT NULL,
        \`date\`           DATE                             NOT NULL,
        \`reason\`         VARCHAR(255)                     NULL,
        \`declared_by\`    VARCHAR(100)                     NULL,
        \`performed_at\`   DATETIME                         NOT NULL DEFAULT NOW(),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_planning_audit_commercial\` (\`commercial_id\`),
        INDEX \`IDX_planning_audit_date\`       (\`date\`),
        INDEX \`IDX_planning_audit_performed\`  (\`performed_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS \`commercial_planning_audit\``);
  }
}
