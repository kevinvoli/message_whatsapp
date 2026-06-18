import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillExpiredWindowsClose1750291200001 implements MigrationInterface {
  name = 'BackfillExpiredWindowsClose1750291200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_chat'))) return;

    // ── 1. Sessions zombies : fermer les sessions ouvertes sur des chats déjà FERMÉS ──
    if (await queryRunner.hasTable('chat_session')) {
      await queryRunner.query(`
        UPDATE chat_session s
        JOIN whatsapp_chat c ON c.id = s.whatsapp_chat_id
        SET s.ended_at = NOW()
        WHERE s.ended_at IS NULL
          AND c.status = 'fermé'
      `);

      // Nettoyage : active_session_id pointant sur une session déjà fermée
      await queryRunner.query(`
        UPDATE whatsapp_chat c
        JOIN chat_session s ON s.id = c.active_session_id
        SET c.active_session_id = NULL
        WHERE s.ended_at IS NOT NULL
          AND c.status IN ('actif', 'en attente')
          AND c.deletedAt IS NULL
      `);
    }

    // ── 2. Désync : session ouverte avec auto_close_at expiré ET window_expires_at NULL ──
    // → Fermer la session ET le chat en une seule requête
    if (await queryRunner.hasTable('chat_session')) {
      await queryRunner.query(`
        UPDATE whatsapp_chat c
        JOIN chat_session s ON s.whatsapp_chat_id = c.id
        SET s.ended_at          = NOW(),
            c.status            = 'fermé',
            c.window_expires_at = NULL,
            c.active_session_id = NULL,
            c.read_only         = 0
        WHERE c.window_expires_at IS NULL
          AND c.status IN ('actif', 'en attente')
          AND c.deletedAt IS NULL
          AND s.ended_at IS NULL
          AND s.auto_close_at IS NOT NULL
          AND s.auto_close_at < NOW()
      `);
    }

    // ── 3. Sans session valide, fenêtre calculée depuis last_client_message_at expirée ──
    // Exclut les chats qui ont encore une session ouverte valide (auto_close_at futur)
    await queryRunner.query(`
      UPDATE whatsapp_chat c
      SET c.status            = 'fermé',
          c.window_expires_at = NULL,
          c.active_session_id = NULL,
          c.read_only         = 0
      WHERE c.window_expires_at IS NULL
        AND c.status IN ('actif', 'en attente')
        AND c.deletedAt IS NULL
        AND (
          c.last_client_message_at IS NULL
          OR DATE_ADD(c.last_client_message_at, INTERVAL 24 HOUR) < NOW()
        )
        AND NOT EXISTS (
          SELECT 1 FROM chat_session s3
          WHERE s3.whatsapp_chat_id = c.id
            AND s3.ended_at IS NULL
            AND s3.auto_close_at >= NOW()
        )
    `);

    // ── 4. Conversations encore valides : recalculer window_expires_at pour les rendre visibles ──
    await queryRunner.query(`
      UPDATE whatsapp_chat c
      SET c.window_expires_at = DATE_ADD(c.last_client_message_at, INTERVAL 24 HOUR)
      WHERE c.window_expires_at IS NULL
        AND c.status IN ('actif', 'en attente')
        AND c.last_client_message_at IS NOT NULL
        AND DATE_ADD(c.last_client_message_at, INTERVAL 24 HOUR) >= NOW()
        AND c.deletedAt IS NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback : les fermetures étaient légitimes (fenêtre expirée)
  }
}
