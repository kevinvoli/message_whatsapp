import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookEventLog1739560000005
  implements MigrationInterface
{
  name = 'CreateWebhookEventLog1739560000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('webhook_event_log');
    if (exists) {
      return;
    }

    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `webhook_event_log` (' +
        '`id` char(36) NOT NULL,' +
        '`tenant_id` char(36) DEFAULT NULL,' +
        '`provider` varchar(32) NOT NULL,' +
        '`event_key` varchar(191) NOT NULL,' +
        '`event_type` varchar(64) DEFAULT NULL,' +
        '`direction` varchar(8) DEFAULT NULL,' +
        '`provider_message_id` varchar(191) DEFAULT NULL,' +
        '`payload_hash` varchar(64) DEFAULT NULL,' +
        '`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        'PRIMARY KEY (`id`),' +
        'UNIQUE KEY `UQ_webhook_event_log_tenant_provider_event_key` (`tenant_id`,`provider`,`event_key`),' +
        'KEY `IDX_webhook_event_log_provider_createdAt` (`provider`,`createdAt`),' +
        'KEY `IDX_webhook_event_log_tenant_id` (`tenant_id`)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `webhook_event_log`');
  }
}
