import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisconnectReasonToConnectionLog1751000000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE messaging_connection_log ADD COLUMN disconnect_reason VARCHAR(255) NULL DEFAULT NULL AFTER alerted_at`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE messaging_connection_log DROP COLUMN disconnect_reason`);
  }
}
