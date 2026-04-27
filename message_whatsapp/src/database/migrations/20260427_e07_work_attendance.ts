import { MigrationInterface, QueryRunner } from 'typeorm';

export class E07WorkAttendance1745769600006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_attendance (
        id              CHAR(36)      NOT NULL,
        commercial_id   VARCHAR(36)   NOT NULL,
        event_type      VARCHAR(20)   NOT NULL,
        event_at        TIMESTAMP     NOT NULL,
        work_date       CHAR(10)      NOT NULL,
        note            TEXT          NULL,
        created_by_id   VARCHAR(36)   NULL,
        created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX IDX_wa_commercial_date (commercial_id, work_date),
        INDEX IDX_wa_work_date (work_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS work_attendance`);
  }
}
