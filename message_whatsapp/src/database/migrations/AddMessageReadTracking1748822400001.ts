import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageReadTracking1748822400001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_message
        ADD COLUMN read_by_commercial_id CHAR(36) NULL DEFAULT NULL,
        ADD COLUMN read_by_commercial_at DATETIME NULL DEFAULT NULL,
        ADD INDEX IDX_msg_read_by_commercial (read_by_commercial_id),
        ADD CONSTRAINT FK_msg_read_by_commercial
          FOREIGN KEY (read_by_commercial_id)
          REFERENCES whatsapp_commercial(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE whatsapp_commercial
        ADD COLUMN messages_read_count INT NOT NULL DEFAULT 0,
        ADD COLUMN messages_handled_count INT NOT NULL DEFAULT 0,
        ADD COLUMN last_activity_at DATETIME NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_commercial
        DROP COLUMN last_activity_at,
        DROP COLUMN messages_handled_count,
        DROP COLUMN messages_read_count
    `);

    await queryRunner.query(`
      ALTER TABLE whatsapp_message
        DROP FOREIGN KEY FK_msg_read_by_commercial,
        DROP INDEX IDX_msg_read_by_commercial,
        DROP COLUMN read_by_commercial_at,
        DROP COLUMN read_by_commercial_id
    `);
  }
}
