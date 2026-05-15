import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX-H6: Ajoute la colonne last_alert_at a commercial_obligation_batch.
 * Permet de persister le timestamp de la derniere alerte batch bloqué,
 * resistante aux redémarrages du process (remplace la Map en mémoire).
 */
export class FixH6AddLastAlertAtToBatch1747267200002 implements MigrationInterface {
  name = 'FixH6AddLastAlertAtToBatch1747267200002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE commercial_obligation_batch ADD COLUMN last_alert_at DATETIME NULL DEFAULT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE commercial_obligation_batch DROP COLUMN last_alert_at',
    );
  }
}