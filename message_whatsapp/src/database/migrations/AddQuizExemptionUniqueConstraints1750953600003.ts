import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizExemptionUniqueConstraints1750953600003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Supprimer les lignes soft-deleted pour libérer les valeurs uniques
    await queryRunner.query(`DELETE FROM quiz_exemption WHERE deleted_at IS NOT NULL`);

    // UNIQUE sur commercial_id (nullable — MySQL autorise plusieurs NULL)
    await queryRunner.query(`
      ALTER TABLE quiz_exemption
        ADD UNIQUE KEY uq_quiz_exemption_commercial (commercial_id)
    `);

    // UNIQUE sur poste_id (nullable — MySQL autorise plusieurs NULL)
    await queryRunner.query(`
      ALTER TABLE quiz_exemption
        ADD UNIQUE KEY uq_quiz_exemption_poste (poste_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE quiz_exemption DROP INDEX uq_quiz_exemption_poste`);
    await queryRunner.query(`ALTER TABLE quiz_exemption DROP INDEX uq_quiz_exemption_commercial`);
  }
}
