import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhatsappTemplateSchema1746620000001 implements MigrationInterface {
  name = 'FixWhatsappTemplateSchema1746620000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const t = 'whatsapp_template';

    if (!(await queryRunner.hasColumn(t, 'tenant_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`tenant_id\` CHAR(36) NOT NULL DEFAULT 'default' AFTER \`id\``,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'channel_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`channel_id\` VARCHAR(100) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'category'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`category\` ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL DEFAULT 'UTILITY'`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'language'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`language\` VARCHAR(20) NOT NULL DEFAULT 'fr'`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'status'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`status\` ENUM('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','IN_APPEAL','FLAGGED','DELETED') NOT NULL DEFAULT 'PENDING'`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'rejected_reason'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`rejected_reason\` VARCHAR(512) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'meta_template_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`meta_template_id\` VARCHAR(100) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'header_type'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`header_type\` ENUM('TEXT','IMAGE','VIDEO','DOCUMENT') NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'header_content'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`header_content\` TEXT NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'body_text'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`body_text\` TEXT NOT NULL DEFAULT ''`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'footer_text'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`footer_text\` VARCHAR(60) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'parameters'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`parameters\` JSON NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'buttons'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`buttons\` JSON NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'base_model'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`base_model\` VARCHAR(50) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'header_text'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`header_text\` VARCHAR(60) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'header_example'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`header_example\` VARCHAR(255) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'body_example_variables'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`body_example_variables\` JSON NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'submitted_at'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`submitted_at\` DATETIME NULL`,
      );
    }

    if (!(await queryRunner.hasColumn(t, 'submission_error'))) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD \`submission_error\` TEXT NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('whapi_channels', 'waba_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`whapi_channels\` ADD \`waba_id\` VARCHAR(64) NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // pas de rollback destructif
  }
}
