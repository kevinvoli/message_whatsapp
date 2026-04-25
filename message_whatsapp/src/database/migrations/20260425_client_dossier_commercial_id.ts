import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientDossierCommercialId1746028800003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const has = await qr.hasColumn('client_dossier', 'commercial_id');
    if (!has) {
      await qr.query(
        `ALTER TABLE client_dossier ADD COLUMN commercial_id CHAR(36) NULL DEFAULT NULL AFTER contact_id`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE client_dossier DROP COLUMN IF EXISTS commercial_id`);
  }
}
