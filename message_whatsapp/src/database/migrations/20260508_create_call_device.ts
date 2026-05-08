import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCallDevice1746700000002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const exists = await qr.hasTable('call_device');
    if (!exists) {
      await qr.query(`
        CREATE TABLE call_device (
          id          VARCHAR(36)  NOT NULL PRIMARY KEY,
          device_id   VARCHAR(64)  NOT NULL UNIQUE,
          label       VARCHAR(128) NULL,
          poste_id    VARCHAR(64)  NULL,
          first_seen  DATETIME     NOT NULL,
          last_seen   DATETIME     NOT NULL,
          call_count  INT          NOT NULL DEFAULT 0,
          created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX IDX_call_device_poste (poste_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const exists = await qr.hasTable('call_device');
    if (exists) {
      await qr.query(`DROP TABLE call_device`);
    }
  }
}
