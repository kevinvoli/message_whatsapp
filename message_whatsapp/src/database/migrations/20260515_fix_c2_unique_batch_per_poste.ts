import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX-C2: Contrainte applicative renforcee pour les batches obligations.
 * Ajoute un index UNIQUE sur (poste_id, batch_number) pour empecher les doublons
 * de batches avec le meme numero sequentiel pour un meme poste.
 * MySQL ne supporte pas les index partiels WHERE status=pending,
 * la protection principale est applicative (try/catch ER_DUP_ENTRY).
 */
export class FixC2UniqueBatchPerPoste1747267200001 implements MigrationInterface {
  name = 'FixC2UniqueBatchPerPoste1747267200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Index UNIQUE sur (poste_id, batch_number) — empeche les doublons de numero sequentiel
    await queryRunner.query(
      'ALTER TABLE commercial_obligation_batch ADD UNIQUE INDEX UQ_batch_poste_number (poste_id, batch_number)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE commercial_obligation_batch DROP INDEX UQ_batch_poste_number',
    );
  }
}