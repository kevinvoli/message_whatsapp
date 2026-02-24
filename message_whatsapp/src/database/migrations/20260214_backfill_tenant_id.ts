import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillTenantId1739560000002 implements MigrationInterface {
  name = 'BackfillTenantId1739560000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE `whapi_channels` SET `tenant_id` = `id` WHERE `tenant_id` IS NULL',
    );

    if (await queryRunner.hasTable('channels')) {
      await queryRunner.query(
        'UPDATE `channels` c ' +
          'JOIN `whapi_channels` ch ' +
          'ON (c.`channel_id` = ch.`channel_id`) ' +
          'OR (c.`provider` = ch.`provider` AND c.`external_id` = ch.`external_id`) ' +
          'SET c.`tenant_id` = ch.`tenant_id` ' +
          'WHERE c.`tenant_id` IS NULL',
      );
    }

    await queryRunner.query(
      'UPDATE `whatsapp_chat` c ' +
        'JOIN `whapi_channels` ch ON c.`channel_id` = ch.`channel_id` ' +
        'SET c.`tenant_id` = ch.`tenant_id` ' +
        'WHERE c.`tenant_id` IS NULL',
    );

    await queryRunner.query(
      'UPDATE `whatsapp_message` m ' +
        'JOIN `whatsapp_chat` c ON m.`chat_id` = c.`chat_id` ' +
        'SET m.`tenant_id` = c.`tenant_id` ' +
        'WHERE m.`tenant_id` IS NULL',
    );

    await queryRunner.query(
      'UPDATE `whatsapp_media` wm ' +
        'JOIN `whatsapp_message` m ON wm.`message_id` = m.`id` ' +
        'SET wm.`tenant_id` = m.`tenant_id` ' +
        'WHERE wm.`tenant_id` IS NULL',
    );

    if (await queryRunner.hasTable('webhook_event_log')) {
      try {
        await queryRunner.query(
          'UPDATE `webhook_event_log` w ' +
            'JOIN `whapi_channels` ch ' +
            "ON ch.`channel_id` = SUBSTRING_INDEX(SUBSTRING_INDEX(w.`event_key`, ':', 2), ':', -1) " +
            'SET w.`tenant_id` = ch.`tenant_id` ' +
            'WHERE w.`tenant_id` IS NULL AND w.`event_key` IS NOT NULL',
        );
      } catch (error: any) {
        if (error?.code !== 'ER_NO_SUCH_TABLE') {
          throw error;
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('webhook_event_log')) {
      await queryRunner.query(
        'UPDATE `webhook_event_log` SET `tenant_id` = NULL',
      );
    }
    if (await queryRunner.hasTable('channels')) {
      await queryRunner.query('UPDATE `channels` SET `tenant_id` = NULL');
    }
    await queryRunner.query('UPDATE `whatsapp_media` SET `tenant_id` = NULL');
    await queryRunner.query('UPDATE `whatsapp_message` SET `tenant_id` = NULL');
    await queryRunner.query('UPDATE `whatsapp_chat` SET `tenant_id` = NULL');
    await queryRunner.query('UPDATE `whapi_channels` SET `tenant_id` = NULL');
  }
}
