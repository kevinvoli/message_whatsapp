import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoMessageSettings1740604800001 implements MigrationInterface {
  name = 'AddAutoMessageSettings1740604800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'dispatch_settings';

    if (!(await queryRunner.hasColumn(table, 'auto_message_enabled'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`auto_message_enabled\` TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }

    if (!(await queryRunner.hasColumn(table, 'auto_message_delay_min_seconds'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`auto_message_delay_min_seconds\` INT NOT NULL DEFAULT 20`,
      );
    }

    if (!(await queryRunner.hasColumn(table, 'auto_message_delay_max_seconds'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`auto_message_delay_max_seconds\` INT NOT NULL DEFAULT 45`,
      );
    }

    if (!(await queryRunner.hasColumn(table, 'auto_message_max_steps'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`auto_message_max_steps\` INT NOT NULL DEFAULT 3`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'dispatch_settings';

    for (const col of [
      'auto_message_enabled',
      'auto_message_delay_min_seconds',
      'auto_message_delay_max_seconds',
      'auto_message_max_steps',
    ]) {
      if (await queryRunner.hasColumn(table, col)) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``,
        );
      }
    }
  }
}
