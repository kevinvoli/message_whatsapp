import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChannelsMapping1739560000003 implements MigrationInterface {
  name = 'CreateChannelsMapping1739560000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `channels` (' +
        '`id` char(36) NOT NULL,' +
        '`tenant_id` char(36) NOT NULL,' +
        '`provider` varchar(32) NOT NULL,' +
        '`external_id` varchar(191) NOT NULL,' +
        '`channel_id` varchar(191) DEFAULT NULL,' +
        '`status` varchar(32) DEFAULT NULL,' +
        '`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        '`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
        'PRIMARY KEY (`id`),' +
        'UNIQUE KEY `UQ_channels_provider_external_id` (`provider`,`external_id`),' +
        'KEY `IDX_channels_tenant_provider_external` (`tenant_id`,`provider`,`external_id`)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );

    await queryRunner.query(
      'INSERT INTO `channels` (`id`, `tenant_id`, `provider`, `external_id`, `channel_id`, `created_at`, `updated_at`) ' +
        'SELECT UUID(), COALESCE(`tenant_id`, `id`), `provider`, `external_id`, `channel_id`, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ' +
        'FROM `whapi_channels` ' +
        'WHERE `external_id` IS NOT NULL ' +
        'ON DUPLICATE KEY UPDATE ' +
        '`tenant_id` = VALUES(`tenant_id`), ' +
        '`channel_id` = VALUES(`channel_id`), ' +
        '`updated_at` = CURRENT_TIMESTAMP',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `channels`');
  }
}
