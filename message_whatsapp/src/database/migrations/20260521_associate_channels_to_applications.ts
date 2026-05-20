import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Associe les canaux existants à leurs applications via meta_app_id.
 *
 * Complète le backfill précédent (BackfillMessagingApplications1779321600003) :
 * pour tout canal dont meta_app_id correspond à une messaging_application
 * mais dont application_id est encore NULL, on pose le lien.
 *
 * Cas couverts :
 *  - Applications créées manuellement via l'UI après le backfill initial.
 *  - Canaux ajoutés après le backfill (meta_app_id renseigné, application déjà existante).
 *  - Ré-exécution sans effet si tout est déjà lié (idempotent).
 */
export class AssociateChannelsToApplications1779408000001 implements MigrationInterface {
  name = 'AssociateChannelsToApplications1779408000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // COLLATE utf8mb4_unicode_ci forcé sur meta_app_id (whapi_channels = general_ci)
    // pour correspondre à la collation de messaging_applications.app_id (unicode_ci).
    await queryRunner.query(
      `UPDATE whapi_channels c
       INNER JOIN messaging_applications a
         ON c.meta_app_id COLLATE utf8mb4_unicode_ci = a.app_id
       SET c.application_id = a.id
       WHERE c.application_id IS NULL
         AND c.meta_app_id IS NOT NULL
         AND c.meta_app_id COLLATE utf8mb4_unicode_ci != ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE whapi_channels c
       INNER JOIN messaging_applications a ON c.application_id = a.id
       SET c.application_id = NULL
       WHERE c.meta_app_id COLLATE utf8mb4_unicode_ci = a.app_id`,
    );
  }
}
