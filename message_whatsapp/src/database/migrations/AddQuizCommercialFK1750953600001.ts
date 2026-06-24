import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizCommercialFK1750953600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Normaliser commercial_id en CHAR(36) pour correspondre à whatsapp_commercial.id
    await queryRunner.query(`
      ALTER TABLE quiz_attempt
        MODIFY COLUMN commercial_id CHAR(36) NOT NULL
    `);
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
    await queryRunner.query(`
      ALTER TABLE quiz_attempt
        MODIFY COLUMN commercial_id VARCHAR(255) NOT NULL
    `);
  }
}
