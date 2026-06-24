import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizRequirePass1750953600002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_session
        ADD COLUMN require_pass TINYINT(1) NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE quiz_session DROP COLUMN require_pass`);
  }
}
