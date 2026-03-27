import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketingOptOutToContact1774483200003 implements MigrationInterface {
  name = 'AddMarketingOptOutToContact1774483200003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('contact', 'marketing_opt_out'))) {
      await queryRunner.query(
        `ALTER TABLE \`contact\` ADD COLUMN \`marketing_opt_out\` TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('contact', 'marketing_opt_out')) {
      await queryRunner.query(
        `ALTER TABLE \`contact\` DROP COLUMN \`marketing_opt_out\``,
      );
    }
  }
}
