import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizHistoryVisible1782518400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_session
        ADD COLUMN history_visible TINYINT(1) NOT NULL DEFAULT 1
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_session DROP COLUMN history_visible
    `);
  }
}
