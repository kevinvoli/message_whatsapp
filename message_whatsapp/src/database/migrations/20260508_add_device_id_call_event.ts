import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceIdCallEvent1746700000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('call_event', 'device_id');
    if (!hasColumn) {
      await qr.query(
        `ALTER TABLE call_event ADD COLUMN device_id VARCHAR(64) NULL AFTER commercial_id`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('call_event', 'device_id');
    if (hasColumn) {
      await qr.query(`ALTER TABLE call_event DROP COLUMN device_id`);
    }
  }
}
