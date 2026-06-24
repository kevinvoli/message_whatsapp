import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizCommercialFK1750953600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_attempt
        ADD CONSTRAINT fk_quiz_attempt_commercial
        FOREIGN KEY (commercial_id) REFERENCES whatsapp_commercial(id)
        ON DELETE CASCADE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_attempt DROP FOREIGN KEY fk_quiz_attempt_commercial
    `);
  }
}
