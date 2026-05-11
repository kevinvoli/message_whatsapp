import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkingTodayToCommercial1747094400001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasWorking = await qr.hasColumn('whatsapp_commercial', 'is_working_today');
    if (!hasWorking) {
      await qr.query(`
        ALTER TABLE whatsapp_commercial
          ADD COLUMN is_working_today    TINYINT(1)  NOT NULL DEFAULT 0,
          ADD COLUMN working_today_since TIMESTAMP   NULL DEFAULT NULL,
          ADD INDEX  IDX_commercial_working_today (is_working_today)
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE whatsapp_commercial DROP INDEX IF EXISTS IDX_commercial_working_today`);
    await qr.query(`ALTER TABLE whatsapp_commercial DROP COLUMN IF EXISTS working_today_since`);
    await qr.query(`ALTER TABLE whatsapp_commercial DROP COLUMN IF EXISTS is_working_today`);
  }
}
