import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCallEventIdToCallLog1747008060001 implements MigrationInterface {
  name = 'AddCallEventIdToCallLog1747008060001';

  async up(qr: QueryRunner): Promise<void> {
    // Ajouter la colonne si elle n'existe pas encore
    if (!(await qr.hasColumn('call_log', 'call_event_external_id'))) {
      await qr.query(
        `ALTER TABLE call_log ADD COLUMN call_event_external_id VARCHAR(100) NULL DEFAULT NULL`,
      );
    }

    // Ajouter l'index UNIQUE pour garantir l'idempotence (si absent)
    const table = await qr.getTable('call_log');
    const indexExists = table?.indices.some((i) => i.name === 'UQ_call_log_call_event_id');
    if (!indexExists) {
      await qr.query(
        `ALTER TABLE call_log ADD UNIQUE INDEX UQ_call_log_call_event_id (call_event_external_id)`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    // Supprimer l'index en premier
    const table = await qr.getTable('call_log');
    const indexExists = table?.indices.some((i) => i.name === 'UQ_call_log_call_event_id');
    if (indexExists) {
      await qr.query(`ALTER TABLE call_log DROP INDEX UQ_call_log_call_event_id`);
    }

    if (await qr.hasColumn('call_log', 'call_event_external_id')) {
      await qr.query(`ALTER TABLE call_log DROP COLUMN call_event_external_id`);
    }
  }
}
