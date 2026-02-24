import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemovePendingMessages1739440000004 implements MigrationInterface {
  name = 'RemovePendingMessages1739440000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const pendingExists = await queryRunner.hasTable('pending_messages');
    if (pendingExists) {
      await queryRunner.dropTable('pending_messages');
    }

    const dispatchSettings = await queryRunner.getTable('dispatch_settings');
    if (
      dispatchSettings?.columns?.some(
        (column) => column.name === 'pending_dispatch_interval_minutes',
      )
    ) {
      await queryRunner.dropColumn(
        'dispatch_settings',
        'pending_dispatch_interval_minutes',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dispatchSettings = await queryRunner.getTable('dispatch_settings');
    if (
      dispatchSettings &&
      !dispatchSettings.columns.some(
        (column) => column.name === 'pending_dispatch_interval_minutes',
      )
    ) {
      await queryRunner.addColumn(
        'dispatch_settings',
        new TableColumn({
          name: 'pending_dispatch_interval_minutes',
          type: 'int',
          default: 1,
        }),
      );
    }
  }
}
