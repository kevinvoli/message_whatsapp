import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatPicUrl1747353600001 implements MigrationInterface {
  name = 'ChatPicUrl1747353600001';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic TEXT NULL DEFAULT NULL`);
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic_full TEXT NULL DEFAULT NULL`);
    await qr.query(`UPDATE whatsapp_chat SET chat_pic = NULL WHERE chat_pic = 'default.png' OR chat_pic = ''`);
    await qr.query(`UPDATE whatsapp_chat SET chat_pic_full = NULL WHERE chat_pic_full = 'default.png' OR chat_pic_full = ''`);
    const hasCol = await qr.hasColumn('whatsapp_chat', 'chat_pic_refreshed_at');
    if (!hasCol) {
      await qr.query(`ALTER TABLE whatsapp_chat ADD COLUMN chat_pic_refreshed_at DATETIME NULL DEFAULT NULL`);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic VARCHAR(100) NOT NULL DEFAULT 'default.png'`);
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic_full VARCHAR(100) NOT NULL DEFAULT 'default.png'`);
    await qr.query(`ALTER TABLE whatsapp_chat DROP COLUMN IF EXISTS chat_pic_refreshed_at`);
  }
}
