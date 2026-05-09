import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCallEventUnresolved1746748800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS call_event_unresolved (
        id            CHAR(36)     NOT NULL DEFAULT (UUID()),
        external_id   VARCHAR(100) NOT NULL,
        local_number  VARCHAR(30)  DEFAULT NULL,
        remote_number VARCHAR(30)  DEFAULT NULL,
        device_id     VARCHAR(100) DEFAULT NULL,
        call_type     VARCHAR(20)  DEFAULT NULL,
        duration_sec  INT          DEFAULT NULL,
        event_at      DATETIME     NOT NULL,
        reason        VARCHAR(200) DEFAULT NULL,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at   DATETIME     DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_unresolved_external_id (external_id),
        KEY idx_unresolved_event_at (event_at),
        KEY idx_unresolved_resolved (resolved_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS call_event_unresolved`);
  }
}
