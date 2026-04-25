import { MigrationInterface, QueryRunner } from 'typeorm';

export class GicopReportIsSubmitted1746028800002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('conversation_report', 'is_submitted');
    if (!hasColumn) {
      await qr.query(
        `ALTER TABLE conversation_report ADD COLUMN is_submitted BOOLEAN NOT NULL DEFAULT FALSE AFTER is_complete`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE conversation_report DROP COLUMN IF EXISTS is_submitted`);
  }
}
