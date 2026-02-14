import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultitenantColumns1739560000001 implements MigrationInterface {
  name = 'AddMultitenantColumns1739560000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'whapi_channels',
      'tenant_id',
      'char(36) NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'whapi_channels',
      'provider',
      'varchar(32) NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'whapi_channels',
      'external_id',
      'varchar(191) NULL',
    );

    await queryRunner.query(
      "UPDATE `whapi_channels` SET `provider` = 'whapi' WHERE `provider` IS NULL",
    );
    await queryRunner.query(
      'UPDATE `whapi_channels` SET `external_id` = `channel_id` WHERE `external_id` IS NULL AND `channel_id` IS NOT NULL',
    );

    await this.addIndexIfMissing(
      queryRunner,
      'whapi_channels',
      'UQ_whapi_channels_provider_external_id',
      'UNIQUE',
      '`provider`, `external_id`',
    );

    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_chat',
      'tenant_id',
      'char(36) NULL',
    );
    await this.addIndexIfMissing(
      queryRunner,
      'whatsapp_chat',
      'IDX_whatsapp_chat_tenant_id',
      'INDEX',
      '`tenant_id`',
    );
    await this.addIndexIfMissing(
      queryRunner,
      'whatsapp_chat',
      'UQ_whatsapp_chat_tenant_chat_id',
      'UNIQUE',
      '`tenant_id`, `chat_id`',
    );

    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_message',
      'tenant_id',
      'char(36) NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_message',
      'provider',
      'varchar(32) NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_message',
      'provider_message_id',
      'varchar(191) NULL',
    );

    await queryRunner.query(
      "UPDATE `whatsapp_message` SET `provider` = 'whapi' WHERE `provider` IS NULL",
    );
    await queryRunner.query(
      'UPDATE `whatsapp_message` SET `provider_message_id` = `message_id` WHERE `provider_message_id` IS NULL AND `message_id` IS NOT NULL',
    );

    await this.addIndexIfMissing(
      queryRunner,
      'whatsapp_message',
      'IDX_whatsapp_message_tenant_id',
      'INDEX',
      '`tenant_id`',
    );
    await this.addIndexIfMissing(
      queryRunner,
      'whatsapp_message',
      'UQ_whatsapp_message_tenant_provider_msg_direction',
      'UNIQUE',
      '`tenant_id`, `provider`, `provider_message_id`, `direction`',
    );

    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_media',
      'tenant_id',
      'char(36) NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_media',
      'provider',
      'varchar(32) NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'whatsapp_media',
      'provider_media_id',
      'varchar(191) NULL',
    );

    await queryRunner.query(
      "UPDATE `whatsapp_media` SET `provider` = 'whapi' WHERE `provider` IS NULL",
    );
    await queryRunner.query(
      'UPDATE `whatsapp_media` SET `provider_media_id` = `whapi_media_id` WHERE `provider_media_id` IS NULL AND `whapi_media_id` IS NOT NULL',
    );

    await this.addIndexIfMissing(
      queryRunner,
      'whatsapp_media',
      'IDX_whatsapp_media_tenant_id',
      'INDEX',
      '`tenant_id`',
    );

    if (await queryRunner.hasTable('webhook_event_log')) {
      await this.addColumnIfMissing(
        queryRunner,
        'webhook_event_log',
        'tenant_id',
        'char(36) NULL',
      );
      await this.addColumnIfMissing(
        queryRunner,
        'webhook_event_log',
        'direction',
        'varchar(8) NULL',
      );
      await this.addColumnIfMissing(
        queryRunner,
        'webhook_event_log',
        'provider_message_id',
        'varchar(191) NULL',
      );
      await this.addColumnIfMissing(
        queryRunner,
        'webhook_event_log',
        'payload_hash',
        'varchar(64) NULL',
      );

      await this.dropIndexIfExists(
        queryRunner,
        'webhook_event_log',
        'UQ_webhook_event_log_event_key',
      );
      await this.addIndexIfMissing(
        queryRunner,
        'webhook_event_log',
        'UQ_webhook_event_log_tenant_provider_event_key',
        'UNIQUE',
        '`tenant_id`, `provider`, `event_key`',
      );
      await this.addIndexIfMissing(
        queryRunner,
        'webhook_event_log',
        'IDX_webhook_event_log_tenant_id',
        'INDEX',
        '`tenant_id`',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('webhook_event_log')) {
      await this.dropIndexIfExists(
        queryRunner,
        'webhook_event_log',
        'IDX_webhook_event_log_tenant_id',
      );
      await this.dropIndexIfExists(
        queryRunner,
        'webhook_event_log',
        'UQ_webhook_event_log_tenant_provider_event_key',
      );
      await this.addIndexIfMissing(
        queryRunner,
        'webhook_event_log',
        'UQ_webhook_event_log_event_key',
        'UNIQUE',
        '`event_key`',
      );
      await this.dropColumnIfExists(
        queryRunner,
        'webhook_event_log',
        'payload_hash',
      );
      await this.dropColumnIfExists(
        queryRunner,
        'webhook_event_log',
        'provider_message_id',
      );
      await this.dropColumnIfExists(
        queryRunner,
        'webhook_event_log',
        'direction',
      );
      await this.dropColumnIfExists(queryRunner, 'webhook_event_log', 'tenant_id');
    }

    await this.dropIndexIfExists(
      queryRunner,
      'whatsapp_media',
      'IDX_whatsapp_media_tenant_id',
    );
    await this.dropColumnIfExists(queryRunner, 'whatsapp_media', 'provider_media_id');
    await this.dropColumnIfExists(queryRunner, 'whatsapp_media', 'provider');
    await this.dropColumnIfExists(queryRunner, 'whatsapp_media', 'tenant_id');

    await this.dropIndexIfExists(
      queryRunner,
      'whatsapp_message',
      'UQ_whatsapp_message_tenant_provider_msg_direction',
    );
    await this.dropIndexIfExists(
      queryRunner,
      'whatsapp_message',
      'IDX_whatsapp_message_tenant_id',
    );
    await this.dropColumnIfExists(queryRunner, 'whatsapp_message', 'provider_message_id');
    await this.dropColumnIfExists(queryRunner, 'whatsapp_message', 'provider');
    await this.dropColumnIfExists(queryRunner, 'whatsapp_message', 'tenant_id');

    await this.dropIndexIfExists(
      queryRunner,
      'whatsapp_chat',
      'UQ_whatsapp_chat_tenant_chat_id',
    );
    await this.dropIndexIfExists(
      queryRunner,
      'whatsapp_chat',
      'IDX_whatsapp_chat_tenant_id',
    );
    await this.dropColumnIfExists(queryRunner, 'whatsapp_chat', 'tenant_id');

    await this.dropIndexIfExists(
      queryRunner,
      'whapi_channels',
      'UQ_whapi_channels_provider_external_id',
    );
    await this.dropColumnIfExists(queryRunner, 'whapi_channels', 'external_id');
    await this.dropColumnIfExists(queryRunner, 'whapi_channels', 'provider');
    await this.dropColumnIfExists(queryRunner, 'whapi_channels', 'tenant_id');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    const exists = await queryRunner.hasColumn(table, column);
    if (!exists) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
      );
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const exists = await queryRunner.hasColumn(table, column);
    if (exists) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``,
      );
    }
  }

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`,
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    indexType: 'INDEX' | 'UNIQUE',
    columns: string,
  ): Promise<void> {
    const exists = await this.indexExists(queryRunner, table, indexName);
    if (!exists) {
      const keyword = indexType === 'UNIQUE' ? 'ADD UNIQUE KEY' : 'ADD INDEX';
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ${keyword} \`${indexName}\` (${columns})`,
      );
    }
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    const exists = await this.indexExists(queryRunner, table, indexName);
    if (exists) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``,
      );
    }
  }
}
