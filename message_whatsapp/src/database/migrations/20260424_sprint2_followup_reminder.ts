import { MigrationInterface, QueryRunner } from 'typeorm';

export class Sprint2FollowUpReminder1745942400002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('follow_up', 'reminded_at'))) {
      await qr.query('ALTER TABLE `follow_up` ADD COLUMN `reminded_at` TIMESTAMP NULL DEFAULT NULL');
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('follow_up', 'reminded_at')) {
      await qr.query('ALTER TABLE `follow_up` DROP COLUMN `reminded_at`');
    }
  }
}
