import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillWindowExpiresAt1781654400001 implements MigrationInterface {
  name = 'BackfillWindowExpiresAt1781654400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_chat'))) return;

    // Pour toutes les conversations actives/en attente sans window_expires_at,
    // on reconstitue la date d'expiration à partir du dernier message client.
    // Si last_client_message_at + 24h est dans le passé → fenêtre expirée (frontend bloquera).
    // Si c'est dans le futur → fenêtre active (frontend débloquera).
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET window_expires_at = DATE_ADD(last_client_message_at, INTERVAL 24 HOUR)
      WHERE window_expires_at IS NULL
        AND last_client_message_at IS NOT NULL
        AND status IN ('actif', 'en_attente')
        AND deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_chat'))) return;

    // On remet à null uniquement les valeurs que le up() a pu écrire :
    // celles calculées depuis last_client_message_at (sans active_session_id).
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET window_expires_at = NULL
      WHERE window_expires_at IS NOT NULL
        AND active_session_id IS NULL
        AND status IN ('actif', 'en_attente')
        AND deleted_at IS NULL
    `);
  }
}
