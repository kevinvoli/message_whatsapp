import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullableContactIdInCallLog1747008120001 implements MigrationInterface {
  name = 'NullableContactIdInCallLog1747008120001';

  async up(qr: QueryRunner): Promise<void> {
    // Rendre contact_id nullable (appels vers numéros sans contact WhatsApp)
    await qr.query(
      `ALTER TABLE call_log MODIFY COLUMN contact_id VARCHAR(36) NULL DEFAULT NULL`,
    );

    // Ajouter client_phone si absent
    if (!(await qr.hasColumn('call_log', 'client_phone'))) {
      await qr.query(
        `ALTER TABLE call_log ADD COLUMN client_phone VARCHAR(50) NULL DEFAULT NULL`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('call_log', 'client_phone')) {
      await qr.query(`ALTER TABLE call_log DROP COLUMN client_phone`);
    }

    // Repasser contact_id en NOT NULL (attention : les lignes avec NULL seront problématiques)
    await qr.query(
      `ALTER TABLE call_log MODIFY COLUMN contact_id VARCHAR(36) NOT NULL`,
    );
  }
}
