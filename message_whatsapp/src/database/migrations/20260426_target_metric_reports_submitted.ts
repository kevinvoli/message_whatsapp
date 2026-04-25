import { MigrationInterface, QueryRunner } from 'typeorm';

export class TargetMetricReportsSubmitted1746115200001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE commercial_target MODIFY COLUMN metric ENUM('conversations','calls','follow_ups','orders','relances','reports_submitted') NOT NULL`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE commercial_target MODIFY COLUMN metric ENUM('conversations','calls','follow_ups','orders','relances') NOT NULL`,
    );
  }
}
