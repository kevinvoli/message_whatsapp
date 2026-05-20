import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessagingApplication1779235200001 implements MigrationInterface {
  name = 'AddMessagingApplication1779235200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── messaging_applications ───────────────────────────────────────────────
    // Note: DDL auto-commit en MySQL — ces étapes survivent à un ROLLBACK précédent.
    // La table et la colonne peuvent donc déjà exister si une exécution précédente a échoué.
    if (!(await queryRunner.hasTable('messaging_applications'))) {
      await queryRunner.query(
        'CREATE TABLE `messaging_applications` (' +
          '`id` char(36) NOT NULL,' +
          '`label` varchar(100) NOT NULL,' +
          "`provider` varchar(32) NOT NULL DEFAULT 'meta'," +
          '`app_id` varchar(64) NOT NULL,' +
          '`app_secret` varchar(128) NOT NULL,' +
          '`system_token` text NULL,' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
          'PRIMARY KEY (`id`)' +
          ') ENGINE=InnoDB ROW_FORMAT=DYNAMIC',
      );
    }

    // ─── whapi_channels.application_id ────────────────────────────────────────
    if (!(await queryRunner.hasColumn('whapi_channels', 'application_id'))) {
      await queryRunner.query(
        'ALTER TABLE `whapi_channels` ADD `application_id` char(36) NULL DEFAULT NULL',
      );
    }

    // Note: la FK est volontairement omise ici — un mismatch de collation MySQL
    // entre whapi_channels (charset base de données) et messaging_applications
    // provoque errno 150. L'intégrité est garantie au niveau applicatif
    // (ApplicationService.remove() bloque la suppression si des canaux sont liés).
    // La contrainte FK sera ajoutée dans une migration séparée après alignement
    // des charsets en production.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('whapi_channels', 'application_id')) {
      await queryRunner.query(
        'ALTER TABLE `whapi_channels` DROP COLUMN `application_id`',
      );
    }

    if (await queryRunner.hasTable('messaging_applications')) {
      await queryRunner.query('DROP TABLE `messaging_applications`');
    }
  }
}
