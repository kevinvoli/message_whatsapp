import { MigrationInterface, QueryRunner } from 'typeorm';

export class E07WorkSchedule1745769600005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_schedule (
        id            CHAR(36)      NOT NULL,
        commercial_id VARCHAR(36)   NULL,
        group_id      VARCHAR(36)   NULL,
        group_name    VARCHAR(100)  NULL,
        day_of_week   VARCHAR(15)   NOT NULL,
        start_time    VARCHAR(5)    NOT NULL,
        end_time      VARCHAR(5)    NOT NULL,
        break_slots   JSON          NULL,
        is_active     TINYINT(1)    NOT NULL DEFAULT 1,
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX IDX_ws_commercial_id (commercial_id),
        INDEX IDX_ws_group_id      (group_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS work_schedule`);
  }
}
