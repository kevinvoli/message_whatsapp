import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdleDisconnectSettings1748822400002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatch_settings
        ADD COLUMN max_read_messages_per_minute INT NOT NULL DEFAULT 1,
        ADD COLUMN idle_disconnect_enabled TINYINT(1) NOT NULL DEFAULT 1,
        ADD COLUMN idle_disconnect_minutes INT NOT NULL DEFAULT 15
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispatch_settings
        DROP COLUMN idle_disconnect_minutes,
        DROP COLUMN idle_disconnect_enabled,
        DROP COLUMN max_read_messages_per_minute
    `);
  }
}
