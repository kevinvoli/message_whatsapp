import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfilePicFetchedAt1750041600001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE whatsapp_chat
      MODIFY COLUMN chat_pic VARCHAR(255) NOT NULL DEFAULT 'default.png',
      MODIFY COLUMN chat_pic_full VARCHAR(255) NOT NULL DEFAULT 'default.png'`);

    const [col] = await qr.query(`SHOW COLUMNS FROM whatsapp_chat LIKE 'profile_pic_fetched_at'`);
    if (!col) {
      await qr.query(`ALTER TABLE whatsapp_chat ADD COLUMN profile_pic_fetched_at TIMESTAMP NULL DEFAULT NULL`);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE whatsapp_chat DROP COLUMN IF EXISTS profile_pic_fetched_at`);
    await qr.query(`ALTER TABLE whatsapp_chat
      MODIFY COLUMN chat_pic VARCHAR(100) NOT NULL DEFAULT 'default.png',
      MODIFY COLUMN chat_pic_full VARCHAR(100) NOT NULL DEFAULT 'default.png'`);
  }
}
