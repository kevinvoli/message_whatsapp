import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizRequirePass1750953600002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_session
        ADD COLUMN require_pass TINYINT(1) NOT NULL DEFAULT 0
          COMMENT 'Si 1 : le commercial doit atteindre le score de passage pour débloquer l'accès. Si 0 : toute soumission débloque.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE quiz_session DROP COLUMN require_pass`);
  }
}
