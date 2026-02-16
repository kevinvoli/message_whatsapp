import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrorFieldsToMessage1739580000001
  implements MigrationInterface
{
  name = 'AddErrorFieldsToMessage1739580000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) {
      return;
    }

    const columns = await queryRunner.query(
      `SHOW COLUMNS FROM \`whatsapp_message\` WHERE Field IN ('error_code', 'error_title')`,
    );
    const existing = new Set(
      (columns as Array<{ Field: string }>).map((c) => c.Field),
    );

    if (!existing.has('error_code')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` ADD COLUMN \`error_code\` INT NULL`,
      );
    }

    if (!existing.has('error_title')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` ADD COLUMN \`error_title\` VARCHAR(255) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) {
      return;
    }

    const columns = await queryRunner.query(
      `SHOW COLUMNS FROM \`whatsapp_message\` WHERE Field IN ('error_code', 'error_title')`,
    );
    const existing = new Set(
      (columns as Array<{ Field: string }>).map((c) => c.Field),
    );

    if (existing.has('error_title')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`error_title\``,
      );
    }

    if (existing.has('error_code')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\` DROP COLUMN \`error_code\``,
      );
    }
  }
}
