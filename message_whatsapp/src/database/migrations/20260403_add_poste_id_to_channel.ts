import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddPosteIdToChannel1743638400000 implements MigrationInterface {
  name = 'AddPosteIdToChannel1743638400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'poste_id',
        type: 'char',
        length: '36',
        isNullable: true,
        default: null,
      }),
    );

    await queryRunner.createForeignKey(
      'whapi_channels',
      new TableForeignKey({
        name: 'FK_whapi_channels_poste_id',
        columnNames: ['poste_id'],
        referencedTableName: 'whatsapp_poste',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('whapi_channels', 'FK_whapi_channels_poste_id');
    await queryRunner.dropColumn('whapi_channels', 'poste_id');
  }
}
