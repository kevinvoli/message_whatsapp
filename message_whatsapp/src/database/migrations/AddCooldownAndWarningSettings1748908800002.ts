import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCooldownAndWarningSettings1748908800002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dispatch_settings
        ADD COLUMN read_cooldown_seconds INT NOT NULL DEFAULT 120,
        ADD COLUMN idle_warning_seconds INT NOT NULL DEFAULT 10`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispatch_settings DROP COLUMN read_cooldown_seconds`);
    await queryRunner.query(`ALTER TABLE dispatch_settings DROP COLUMN idle_warning_seconds`);
  }
}
