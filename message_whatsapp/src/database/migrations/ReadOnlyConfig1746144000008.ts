import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReadOnlyConfig1746144000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` ADD COLUMN \`read_only_after_messages\` INT NULL DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`poste_message_count_since_last_client\` INT NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_settings\` ADD COLUMN \`read_only_max_messages\` INT NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dispatch_settings\` DROP COLUMN IF EXISTS \`read_only_max_messages\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_chat\` DROP COLUMN IF EXISTS \`poste_message_count_since_last_client\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` DROP COLUMN IF EXISTS \`read_only_after_messages\``,
    );
  }
}
