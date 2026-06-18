import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenVersionToCommercial1750291200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE whatsapp_commercial ADD COLUMN token_version INT NOT NULL DEFAULT 1`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE whatsapp_commercial DROP COLUMN token_version`,
    );
  }
}
