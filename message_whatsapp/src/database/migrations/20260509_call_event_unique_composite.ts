import { MigrationInterface, QueryRunner } from 'typeorm';

export class CallEventUniqueComposite1746748800002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Index composite sur (device_id, client_phone, event_at) pour détecter
    // les doublons d'appels lorsque device_id est connu.
    // On utilise un INDEX simple (pas UNIQUE) car MySQL ne supporte pas
    // les contraintes UNIQUE partielles nativement.
    // L'idempotence principale reste garantie par UQ_call_event_external_id.
    await queryRunner.query(`
      ALTER TABLE call_event
        ADD INDEX IDX_call_event_device_ts (device_id, client_phone, event_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE call_event DROP INDEX IDX_call_event_device_ts
    `);
  }
}
