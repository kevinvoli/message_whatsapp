import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPriorityToChat20260427 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_chat
        ADD COLUMN is_priority TINYINT(1) NOT NULL DEFAULT 0
          COMMENT 'Conv rouverte par le client après soumission de rapport — traitement urgent'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_chat DROP COLUMN is_priority
    `);
  }
}
