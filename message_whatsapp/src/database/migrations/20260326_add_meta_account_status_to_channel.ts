import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaAccountStatusToChannel20260326 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'whapi_channels';

    if (!(await queryRunner.hasColumn(table, 'meta_account_status'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`meta_account_status\` VARCHAR(32) NULL DEFAULT NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(table, 'meta_account_status_updated_at'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`meta_account_status_updated_at\` DATETIME NULL DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'whapi_channels';

    if (await queryRunner.hasColumn(table, 'meta_account_status_updated_at')) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`meta_account_status_updated_at\``,
      );
    }

    if (await queryRunner.hasColumn(table, 'meta_account_status')) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`meta_account_status\``,
      );
    }
  }
}
