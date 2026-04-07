import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSystemAlertConfig1744070400000 implements MigrationInterface {
  name = 'CreateSystemAlertConfig1744070400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'system_alert_config',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
          },
          {
            name: 'enabled',
            type: 'tinyint',
            width: 1,
            default: 1,
          },
          {
            name: 'silence_threshold_minutes',
            type: 'int',
            default: 60,
          },
          {
            name: 'retry_after_minutes',
            type: 'int',
            default: 15,
          },
          {
            name: 'recipients',
            type: 'json',
            default: "'[]'",
          },
          {
            name: 'message_template',
            type: 'text',
            isNullable: true,
            default: null,
          },
        ],
      }),
      true,
    );

    // Insérer la ligne singleton avec les valeurs par défaut
    await queryRunner.query(
      `INSERT INTO system_alert_config (id, enabled, silence_threshold_minutes, retry_after_minutes, recipients, message_template)
       VALUES (1, 1, 60, 15, '[]', NULL)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('system_alert_config');
  }
}
