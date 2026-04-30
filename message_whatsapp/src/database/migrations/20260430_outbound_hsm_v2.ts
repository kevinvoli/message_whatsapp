import { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboundHsmV21746000000002 implements MigrationInterface {
  name = 'OutboundHsmV21746000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotente : ajoute rejection_reason si la colonne est absente
    const table = await queryRunner.getTable('whatsapp_template');
    if (table && !table.findColumnByName('rejection_reason')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_template\` ADD \`rejection_reason\` text NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whatsapp_template');
    if (table && table.findColumnByName('rejection_reason')) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_template\` DROP COLUMN \`rejection_reason\``,
      );
    }
  }
}
