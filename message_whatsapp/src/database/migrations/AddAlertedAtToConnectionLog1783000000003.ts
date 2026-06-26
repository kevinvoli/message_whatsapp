import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertedAtToConnectionLog1783000000003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('messaging_connection_log', 'alerted_at'))) {
      await qr.query(`
        ALTER TABLE \`messaging_connection_log\`
          ADD COLUMN \`alerted_at\` DATETIME NULL DEFAULT NULL
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('messaging_connection_log', 'alerted_at')) {
      await qr.query(`ALTER TABLE \`messaging_connection_log\` DROP COLUMN \`alerted_at\``);
    }
  }
}
