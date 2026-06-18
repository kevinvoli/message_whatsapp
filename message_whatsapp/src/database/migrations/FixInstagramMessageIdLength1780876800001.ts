import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixInstagramMessageIdLength1780876800001
  implements MigrationInterface
{
  name = 'FixInstagramMessageIdLength1780876800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) return;

    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_message'
         AND COLUMN_NAME IN ('message_id', 'external_id', 'provider_message_id')`,
    );

    const lengths = new Map<string, number>(
      (cols as any[]).map((r) => [r.COLUMN_NAME, Number(r.CHARACTER_MAXIMUM_LENGTH)]),
    );

    if ((lengths.get('message_id') ?? 0) < 512) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\`
           MODIFY COLUMN \`message_id\` VARCHAR(512) NULL`,
      );
    }

    if ((lengths.get('external_id') ?? 0) < 512) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\`
           MODIFY COLUMN \`external_id\` VARCHAR(512) NULL`,
      );
    }

    if ((lengths.get('provider_message_id') ?? 0) < 512) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_message\`
           MODIFY COLUMN \`provider_message_id\` VARCHAR(512) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_message'))) return;

    await queryRunner.query(
      `ALTER TABLE \`whatsapp_message\`
         MODIFY COLUMN \`message_id\` VARCHAR(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_message\`
         MODIFY COLUMN \`external_id\` VARCHAR(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_message\`
         MODIFY COLUMN \`provider_message_id\` VARCHAR(191) NULL`,
    );
  }
}
