import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMissedCallEvent1747094400003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS missed_call_event (
        id                        CHAR(36)      NOT NULL,
        source                    ENUM('whatsapp','db2') NOT NULL,
        external_id               VARCHAR(100)  NOT NULL,
        occurred_at               TIMESTAMP     NOT NULL,
        client_phone              VARCHAR(50)   NOT NULL,
        client_name               VARCHAR(200)  NULL,
        poste_id                  VARCHAR(36)   NULL,
        commercial_id             VARCHAR(36)   NULL,
        device_id                 VARCHAR(100)  NULL,
        callback_task_id          VARCHAR(36)   NULL,
        callback_done_at          TIMESTAMP     NULL,
        callback_call_event_id    VARCHAR(100)  NULL,
        callback_duration_seconds INT           NULL,
        handling_delay_seconds    INT           NULL,
        sla_breached_at           TIMESTAMP     NULL,
        escalated_at              TIMESTAMP     NULL,
        status                    ENUM('pending','assigned','called_back','escalated','closed') NOT NULL DEFAULT 'pending',
        created_at                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE INDEX IDX_mce_external_id (external_id),
        INDEX IDX_mce_client_phone_status (client_phone, status, occurred_at),
        INDEX IDX_mce_poste_status (poste_id, status),
        INDEX IDX_mce_commercial_status (commercial_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS missed_call_event`);
  }
}
