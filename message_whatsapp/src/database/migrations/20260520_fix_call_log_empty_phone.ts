import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCallLogEmptyPhone1747699200001 implements MigrationInterface {
  name = 'FixCallLogEmptyPhone1747699200001';

  async up(qr: QueryRunner): Promise<void> {
    // Normalise les client_phone vides ('') en NULL pour activer le bulk-treat par numéro.
    // Ces entrées ont été créées avant le correctif qui ajoute || null dans order-call-sync.
    await qr.query(`UPDATE call_log SET client_phone = NULL WHERE client_phone = ''`);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Pas de rollback : on ne peut pas distinguer les NULL volontaires des NULL migrés.
  }
}
