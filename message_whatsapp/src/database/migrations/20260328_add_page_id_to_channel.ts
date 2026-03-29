import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPageIdToChannel1743120000000 implements MigrationInterface {
  name = 'AddPageIdToChannel1743120000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'page_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
        default: null,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whapi_channels', 'page_id');
  }
}
