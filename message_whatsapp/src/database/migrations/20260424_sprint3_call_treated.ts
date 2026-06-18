import { MigrationInterface, QueryRunner } from 'typeorm';

export class Sprint3CallTreated1745942400003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('call_log', 'treated'))) {
      await qr.query('ALTER TABLE `call_log` ADD COLUMN `treated` TINYINT(1) NOT NULL DEFAULT 0');
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('call_log', 'treated')) {
      await qr.query('ALTER TABLE `call_log` DROP COLUMN `treated`');
    }
  }
}
