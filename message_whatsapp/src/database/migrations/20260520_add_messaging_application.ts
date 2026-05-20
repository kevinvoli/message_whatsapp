import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessagingApplication1779235200001 implements MigrationInterface {
  name = 'AddMessagingApplication1779235200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── messaging_applications ───────────────────────────────────────────────
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

    // ─── FK whapi_channels → messaging_applications ───────────────────────────
    const table = await queryRunner.getTable('whapi_channels');
    const fkExists = table?.foreignKeys.some(
      (fk) => fk.name === 'FK_whapi_channels_application_id',
    );
    if (!fkExists) {
      await queryRunner.query(
        'ALTER TABLE `whapi_channels` ADD CONSTRAINT `FK_whapi_channels_application_id` ' +
          'FOREIGN KEY (`application_id`) REFERENCES `messaging_applications` (`id`) ' +
          'ON DELETE SET NULL ON UPDATE CASCADE',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whapi_channels');
    const fkExists = table?.foreignKeys.some(
      (fk) => fk.name === 'FK_whapi_channels_application_id',
    );
    if (fkExists) {
      await queryRunner.query(
        'ALTER TABLE `whapi_channels` DROP FOREIGN KEY `FK_whapi_channels_application_id`',
      );
    }

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
