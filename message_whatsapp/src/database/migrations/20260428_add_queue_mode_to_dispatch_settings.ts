import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQueueModeToDispatchSettings1745798400001 implements MigrationInterface {
  name = 'AddQueueModeToDispatchSettings1745798400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('dispatch_settings');
    if (!table) return;

    const columnExists = table.columns.some((c) => c.name === 'queue_mode');
    if (!columnExists) {
      await queryRunner.addColumn(
        'dispatch_settings',
        new TableColumn({
          name: 'queue_mode',
          type: 'varchar',
          length: '20',
          default: "'least_loaded'",
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('dispatch_settings');
    if (!table) return;
    const columnExists = table.columns.some((c) => c.name === 'queue_mode');
    if (columnExists) {
      await queryRunner.dropColumn('dispatch_settings', 'queue_mode');
    }
  }
}
