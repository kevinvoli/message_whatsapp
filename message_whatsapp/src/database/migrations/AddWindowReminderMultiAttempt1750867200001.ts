import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWindowReminderMultiAttempt1750867200001 implements MigrationInterface {
  name = 'AddWindowReminderMultiAttempt1750867200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE window_reminder_log (
        id CHAR(36) NOT NULL PRIMARY KEY,
        session_id CHAR(36) NOT NULL,
        attempt_number INT NOT NULL,
        sent_at DATETIME NOT NULL,
        client_responded_at DATETIME NULL DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wrl_session_attempt (session_id, attempt_number),
        KEY idx_wrl_session_responded (session_id, client_responded_at),
        CONSTRAINT fk_wrl_session FOREIGN KEY (session_id) REFERENCES chat_session(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE cron_config
        ADD COLUMN window_reminder_max_attempts INT NULL DEFAULT 1
          COMMENT 'Nombre max de tentatives de relance avant expiration',
        ADD COLUMN window_reminder_attempt_interval_min INT NULL DEFAULT 30
          COMMENT 'Délai minimum en minutes entre deux tentatives'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cron_config
        DROP COLUMN window_reminder_attempt_interval_min,
        DROP COLUMN window_reminder_max_attempts
    `);

    await queryRunner.query(`DROP TABLE window_reminder_log`);
  }
}
