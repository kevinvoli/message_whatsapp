import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchModeColumn1747267200001 implements MigrationInterface {
  name = 'DispatchModeColumn1747267200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'dispatch_settings'
         AND COLUMN_NAME = 'dispatch_mode'`,
    );
    if (parseInt(rows[0]?.cnt ?? '0', 10) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`dispatch_settings\`
         ADD COLUMN \`dispatch_mode\` VARCHAR(20) NOT NULL DEFAULT 'LEAST_LOADED'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dispatch_settings\` DROP COLUMN IF EXISTS \`dispatch_mode\``,
    );
  }
}
