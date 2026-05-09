import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB2 stocke call_type en majuscules ('OUTGOING', 'MISSED', etc.).
 * Les constantes côté backend sont en minuscules ('outgoing', 'missed').
 * Cette migration normalise les valeurs existantes dans call_event.call_status.
 */
export class NormalizeCallStatusLowercase1746835200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE call_event SET call_status = LOWER(call_status) WHERE call_status != LOWER(call_status)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback utile — les valeurs originales ne sont pas conservées.
  }
}
