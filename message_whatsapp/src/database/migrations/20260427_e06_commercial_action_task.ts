import { MigrationInterface, QueryRunner } from 'typeorm';

export class E06CommercialActionTask1745769600004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commercial_action_task (
        id                       CHAR(36)      NOT NULL,
        source                   VARCHAR(50)   NOT NULL,
        priority                 INT           NOT NULL DEFAULT 50,
        assigned_commercial_id   VARCHAR(36)   NULL,
        assigned_poste_id        VARCHAR(36)   NULL,
        status                   VARCHAR(20)   NOT NULL DEFAULT 'pending',
        entity_id                VARCHAR(100)  NOT NULL,
        contact_name             VARCHAR(200)  NULL,
        contact_phone            VARCHAR(50)   NULL,
        next_action              VARCHAR(100)  NULL,
        due_at                   TIMESTAMP     NULL,
        last_attempt_at          TIMESTAMP     NULL,
        attempt_count            INT           NOT NULL DEFAULT 0,
        form_data                JSON          NULL,
        audio_recording_url      VARCHAR(500)  NULL,
        notes                    TEXT          NULL,
        created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY IDX_cat_entity (entity_id, source),
        INDEX IDX_cat_commercial_status (assigned_commercial_id, status),
        INDEX IDX_cat_due_at (due_at, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commercial_action_task`);
  }
}
