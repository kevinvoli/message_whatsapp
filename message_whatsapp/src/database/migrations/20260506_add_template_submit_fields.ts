import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemplateSubmitFields1778092904967 implements MigrationInterface {
  name = 'AddTemplateSubmitFields1778092904967';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'whatsapp_template';

    const hasBaseModel = await queryRunner.hasColumn(table, 'base_model');
    if (!hasBaseModel) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`base_model\` VARCHAR(50) NULL`,
      );
    }

    const hasHeaderText = await queryRunner.hasColumn(table, 'header_text');
    if (!hasHeaderText) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`header_text\` VARCHAR(60) NULL`,
      );
    }

    const hasHeaderExample = await queryRunner.hasColumn(table, 'header_example');
    if (!hasHeaderExample) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`header_example\` VARCHAR(255) NULL`,
      );
    }

    const hasBodyExampleVariables = await queryRunner.hasColumn(
      table,
      'body_example_variables',
    );
    if (!hasBodyExampleVariables) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`body_example_variables\` JSON NULL`,
      );
    }

    const hasSubmittedAt = await queryRunner.hasColumn(table, 'submitted_at');
    if (!hasSubmittedAt) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`submitted_at\` DATETIME NULL`,
      );
    }

    const hasSubmissionError = await queryRunner.hasColumn(table, 'submission_error');
    if (!hasSubmissionError) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`submission_error\` TEXT NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'whatsapp_template';
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`submission_error\``);
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`submitted_at\``);
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`body_example_variables\``);
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`header_example\``);
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`header_text\``);
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`base_model\``);
  }
}
