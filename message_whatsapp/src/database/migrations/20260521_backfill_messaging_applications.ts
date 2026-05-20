import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Déduit les enregistrements messaging_applications depuis les canaux existants.
 *
 * Logique :
 *  - Groupe les canaux par meta_app_id (déduplique) — un même app_id peut alimenter
 *    plusieurs providers (meta, messenger, instagram).
 *  - Pour chaque app_id distinct, crée une application avec label = app_id.
 *  - Met à jour whapi_channels.application_id pour chaque canal concerné.
 *  - Idempotent : si un enregistrement avec le même app_id existe déjà dans
 *    messaging_applications, réutilise son id au lieu d'en créer un doublon.
 */
export class BackfillMessagingApplications1779321600003 implements MigrationInterface {
  name = 'BackfillMessagingApplications1779321600003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Récupère les paires (meta_app_id, meta_app_secret) distinctes
    // pour les canaux pas encore liés à une application.
    const rows: Array<{ meta_app_id: string; meta_app_secret: string }> =
      await queryRunner.query(
        `SELECT DISTINCT meta_app_id, meta_app_secret
         FROM whapi_channels
         WHERE meta_app_id  IS NOT NULL AND meta_app_id  != ''
           AND meta_app_secret IS NOT NULL AND meta_app_secret != ''
           AND application_id IS NULL`,
      );

    if (rows.length === 0) {
      return;
    }

    for (const row of rows) {
      // Vérifie si l'application existe déjà (idempotence)
      const existing: Array<{ id: string }> = await queryRunner.query(
        'SELECT id FROM messaging_applications WHERE app_id = ? LIMIT 1',
        [row.meta_app_id],
      );

      let applicationId: string;

      if (existing.length > 0) {
        applicationId = existing[0].id;
      } else {
        applicationId = randomUUID();
        await queryRunner.query(
          `INSERT INTO messaging_applications
             (id, label, provider, app_id, app_secret, system_token, created_at, updated_at)
           VALUES (?, ?, 'meta', ?, ?, NULL, NOW(6), NOW(6))`,
          [applicationId, row.meta_app_id, row.meta_app_id, row.meta_app_secret],
        );
      }

      // Lie les canaux correspondants à cette application
      await queryRunner.query(
        `UPDATE whapi_channels
         SET application_id = ?
         WHERE meta_app_id = ?
           AND meta_app_secret = ?
           AND application_id IS NULL`,
        [applicationId, row.meta_app_id, row.meta_app_secret],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Retire le lien application_id sur tous les canaux backfillés
    await queryRunner.query(
      `UPDATE whapi_channels SET application_id = NULL
       WHERE application_id IN (
         SELECT id FROM messaging_applications WHERE label = app_id
       )`,
    );

    // Supprime uniquement les applications créées par ce backfill
    // (reconnaissables au fait que label = app_id)
    await queryRunner.query(
      `DELETE FROM messaging_applications WHERE label = app_id`,
    );
  }
}
