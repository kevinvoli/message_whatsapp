import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreOrphanedSessions1749254400001 implements MigrationInterface {
  name = 'RestoreOrphanedSessions1749254400001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Fermer les sessions encore ouvertes pour les commerciaux déjà déconnectés
    await queryRunner.query(`
      UPDATE messaging_connection_log l
      INNER JOIN whatsapp_commercial c ON c.id = l.user_id
      SET l.logout_at = l.login_at
      WHERE l.user_type = 'commercial'
        AND l.logout_at IS NULL
        AND c.is_connected = 0
        AND c.deleted_at IS NULL
    `);

    // Créer une session reconstituée pour les commerciaux connectés sans session ouverte
    await queryRunner.query(`
      INSERT INTO messaging_connection_log
        (id, user_id, user_type, login_at, logout_at, created_at, updated_at)
      SELECT
        UUID(),
        c.id,
        'commercial',
        CASE
          WHEN c.last_connection_at >= CURDATE() THEN c.last_connection_at
          ELSE CURDATE()
        END,
        NULL,
        NOW(),
        NOW()
      FROM whatsapp_commercial c
      WHERE c.is_connected = 1
        AND c.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM messaging_connection_log l
          WHERE l.user_id = c.id
            AND l.user_type = 'commercial'
            AND l.logout_at IS NULL
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM messaging_connection_log
      WHERE user_type = 'commercial'
        AND created_at >= CURDATE()
        AND login_at = CURDATE()
    `);
  }
}
