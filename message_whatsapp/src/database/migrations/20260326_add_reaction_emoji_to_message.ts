import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReactionEmojiToMessage20260326 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'whatsapp_message';
    if (!(await queryRunner.hasColumn(table, 'reaction_emoji'))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`reaction_emoji\` VARCHAR(10) NULL DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'whatsapp_message';
    if (await queryRunner.hasColumn(table, 'reaction_emoji')) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`reaction_emoji\``,
      );
    }
  }
}
