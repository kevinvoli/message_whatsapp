import { MigrationInterface, QueryRunner } from 'typeorm';

export class E03CommercialDailyPerformance1745769600003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commercial_daily_performance (
        id                CHAR(36)      NOT NULL,
        commercial_id     VARCHAR(36)   NOT NULL,
        commercial_name   VARCHAR(200)  NOT NULL,
        snapshot_date     DATE          NOT NULL,
        messages_sent     INT           NOT NULL DEFAULT 0,
        conversations     INT           NOT NULL DEFAULT 0,
        calls             INT           NOT NULL DEFAULT 0,
        follow_ups_done   INT           NOT NULL DEFAULT 0,
        reports_submitted INT           NOT NULL DEFAULT 0,
        orders            INT           NOT NULL DEFAULT 0,
        score             INT           NOT NULL DEFAULT 0,
        rank_global       INT           NULL,
        computed_at       TIMESTAMP     NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY IDX_cdp_commercial_date (commercial_id, snapshot_date),
        INDEX IDX_cdp_date (snapshot_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commercial_daily_performance`);
  }
}
