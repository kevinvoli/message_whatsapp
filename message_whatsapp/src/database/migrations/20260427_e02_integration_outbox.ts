import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E02-T01 — Création de la table integration_outbox.
 * Queue transactionnelle fiable pour la synchronisation DB1 → DB2.
 */
export class E02IntegrationOutbox1745769600002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_outbox (
        id              CHAR(36)     NOT NULL,
        event_type      VARCHAR(50)  NOT NULL,
        entity_id       VARCHAR(100) NOT NULL,
        payload_json    TEXT         NOT NULL,
        payload_hash    VARCHAR(64)  NOT NULL,
        schema_version  SMALLINT     NOT NULL DEFAULT 1,
        status          ENUM('pending','processing','success','failed') NOT NULL DEFAULT 'pending',
        attempt_count   INT          NOT NULL DEFAULT 0,
        next_retry_at   TIMESTAMP    NULL,
        last_error      TEXT         NULL,
        processed_at    TIMESTAMP    NULL,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX IDX_outbox_status_retry  (status, next_retry_at),
        INDEX IDX_outbox_event_entity  (event_type, entity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration_outbox`);
  }
}
