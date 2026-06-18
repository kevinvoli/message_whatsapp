import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4ContactReferral1745200000010 implements MigrationInterface {
  name = 'Phase4ContactReferral1745200000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('contact', 'referral_code'))) {
      await queryRunner.query('ALTER TABLE `contact` ADD COLUMN `referral_code` VARCHAR(50) NULL DEFAULT NULL');
    }
    if (!(await queryRunner.hasColumn('contact', 'referral_count'))) {
      await queryRunner.query('ALTER TABLE `contact` ADD COLUMN `referral_count` INT NULL DEFAULT NULL');
    }
    if (!(await queryRunner.hasColumn('contact', 'referral_commission'))) {
      await queryRunner.query('ALTER TABLE `contact` ADD COLUMN `referral_commission` DECIMAL(12,2) NULL DEFAULT NULL');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['referral_code', 'referral_count', 'referral_commission']) {
      if (await queryRunner.hasColumn('contact', col)) {
        await queryRunner.query(`ALTER TABLE \`contact\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
