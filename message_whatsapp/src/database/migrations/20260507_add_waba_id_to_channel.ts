import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWabaIdToChannel1778266000001 implements MigrationInterface {
  name = 'AddWabaIdToChannel1778266000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whapi_channels');
    if (table && !table.findColumnByName('waba_id')) {
      await queryRunner.addColumn(
        'whapi_channels',
        new TableColumn({
          name: 'waba_id',
          type: 'varchar',
          length: '64',
          isNullable: true,
          default: null,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whapi_channels');
    if (table && table.findColumnByName('waba_id')) {
      await queryRunner.dropColumn('whapi_channels', 'waba_id');
    }
  }
}
