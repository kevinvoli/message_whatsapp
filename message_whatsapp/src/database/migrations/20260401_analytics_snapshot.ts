import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnalyticsSnapshot20260401 implements MigrationInterface {
  name = 'AnalyticsSnapshot20260401';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`analytics_snapshot\` (
        \`id\`           VARCHAR(36)        NOT NULL,
        \`scope\`        ENUM('global','poste','commercial','channel') NOT NULL,
        \`scope_id\`     VARCHAR(100)       NULL,
        \`date_start\`   DATE               NULL,
        \`date_end\`     DATE               NULL,
        \`data\`         JSON               NOT NULL,
        \`computed_at\`  DATETIME(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`ttl_seconds\`  INT                NOT NULL DEFAULT 600,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_snapshot_scope_id_date\`
        ON \`analytics_snapshot\` (\`scope\`, \`scope_id\`, \`date_start\`)
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_snapshot_computed_at\`
        ON \`analytics_snapshot\` (\`computed_at\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`analytics_snapshot\``);
  }
}
