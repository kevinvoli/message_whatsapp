import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowOutsideHours1777507200000 implements MigrationInterface {
  name = 'AddAllowOutsideHours1777507200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` ADD COLUMN \`allow_outside_hours\` tinyint(1) NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` DROP COLUMN \`allow_outside_hours\``,
    );
  }
}
