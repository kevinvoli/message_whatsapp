import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFollowUpTemplateSentFields1778180000003 implements MigrationInterface {
  name = 'AddFollowUpTemplateSentFields1778180000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('follow_up', 'last_template_sent_at'))) {
      await queryRunner.query(
        `ALTER TABLE \`follow_up\` ADD \`last_template_sent_at\` DATETIME NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('follow_up', 'template_provider_message_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`follow_up\` ADD \`template_provider_message_id\` VARCHAR(100) NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`follow_up\` DROP COLUMN IF EXISTS \`template_provider_message_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`follow_up\` DROP COLUMN IF EXISTS \`last_template_sent_at\``,
    );
  }
}
