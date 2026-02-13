import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddDispatchSettingsAudit1739440000003
  implements MigrationInterface
{
  name = 'AddDispatchSettingsAudit1739440000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('dispatch_settings_audit');
    if (exists) return;

    await queryRunner.createTable(
      new Table({
        name: 'dispatch_settings_audit',
        columns: [
          {
            name: 'id',
            type: 'char',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'settings_id',
            type: 'char',
            length: '36',
          },
          {
            name: 'payload',
            type: 'longtext',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('dispatch_settings_audit');
    if (exists) {
      await queryRunner.dropTable('dispatch_settings_audit');
    }
  }
}
