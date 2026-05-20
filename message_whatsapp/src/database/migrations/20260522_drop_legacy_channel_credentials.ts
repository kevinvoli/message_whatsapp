import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supprime les colonnes meta_app_id et meta_app_secret de whapi_channels.
 *
 * Ces colonnes sont remplacées par la relation application_id → messaging_applications.
 * Un garde-fou vérifie qu'aucun canal Meta/Messenger/Instagram n'utilise encore
 * directement meta_app_secret avant de supprimer.
 */
export class DropLegacyChannelCredentials1779580800001 implements MigrationInterface {
  name = 'DropLegacyChannelCredentials1779580800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphans: Array<{ cnt: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt
       FROM whapi_channels
       WHERE provider IN ('meta', 'messenger', 'instagram')
         AND application_id IS NULL
         AND meta_app_secret IS NOT NULL
         AND meta_app_secret != ''`,
    );
    if (parseInt(orphans[0].cnt, 10) > 0) {
      throw new Error(
        `Migration bloquée : ${orphans[0].cnt} canal(aux) Meta/Messenger/Instagram utilisent encore meta_app_secret directement (application_id IS NULL). Associez-les à une application avant de relancer.`,
      );
    }

    await queryRunner.query(
      'ALTER TABLE `whapi_channels` DROP COLUMN `meta_app_id`',
    );
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` DROP COLUMN `meta_app_secret`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` ADD COLUMN `meta_app_secret` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `whapi_channels` ADD COLUMN `meta_app_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL',
    );
  }
}
