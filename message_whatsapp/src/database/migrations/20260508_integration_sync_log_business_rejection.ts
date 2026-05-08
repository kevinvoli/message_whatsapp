import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationSyncLogBusinessRejection1746648000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('integration_sync_log', 'is_business_rejection');
    if (!hasColumn) {
      await qr.query(
        `ALTER TABLE integration_sync_log
         ADD COLUMN is_business_rejection TINYINT(1) NOT NULL DEFAULT 0 AFTER last_error`,
      );
    }

    const rows: { cnt: string }[] = await qr.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name   = 'integration_sync_log'
         AND index_name   = 'IDX_sync_log_business'`,
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await qr.query(
        `ALTER TABLE integration_sync_log
         ADD INDEX IDX_sync_log_business (status, is_business_rejection)`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE integration_sync_log
       DROP INDEX IF EXISTS IDX_sync_log_business`,
    ).catch(() => {});
    const hasColumn = await qr.hasColumn('integration_sync_log', 'is_business_rejection');
    if (hasColumn) {
      await qr.query(
        `ALTER TABLE integration_sync_log DROP COLUMN is_business_rejection`,
      );
    }
  }
}
