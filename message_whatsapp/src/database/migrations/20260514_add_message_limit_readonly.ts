import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageLimitReadonly1747267200001 implements MigrationInterface {
  name = 'AddMessageLimitReadonly1747267200001';

  async up(qr: QueryRunner): Promise<void> {
    const hasLimitCol = await qr.hasColumn('whapi_channels', 'max_messages_before_readonly');
    if (!hasLimitCol) {
      await qr.query(
        `ALTER TABLE whapi_channels ADD COLUMN max_messages_before_readonly INT NULL DEFAULT NULL AFTER no_close`,
      );
    }

    const hasCountCol = await qr.hasColumn('whatsapp_chat', 'outbound_message_count');
    if (!hasCountCol) {
      await qr.query(
        `ALTER TABLE whatsapp_chat ADD COLUMN outbound_message_count INT NOT NULL DEFAULT 0`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasCountCol = await qr.hasColumn('whatsapp_chat', 'outbound_message_count');
    if (hasCountCol) {
      await qr.query(`ALTER TABLE whatsapp_chat DROP COLUMN outbound_message_count`);
    }

    const hasLimitCol = await qr.hasColumn('whapi_channels', 'max_messages_before_readonly');
    if (hasLimitCol) {
      await qr.query(`ALTER TABLE whapi_channels DROP COLUMN max_messages_before_readonly`);
    }
  }
}
