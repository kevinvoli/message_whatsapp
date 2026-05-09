import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttributionSourceCallEvent1746921600001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('call_event', 'attribution_source');
    if (!hasColumn) {
      await qr.query(
        `ALTER TABLE call_event ADD COLUMN attribution_source VARCHAR(20) NULL AFTER commercial_id`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('call_event', 'attribution_source');
    if (hasColumn) {
      await qr.query(`ALTER TABLE call_event DROP COLUMN attribution_source`);
    }
  }
}
