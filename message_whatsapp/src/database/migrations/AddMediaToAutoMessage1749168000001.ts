import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddMediaToAutoMessage1749168000001 implements MigrationInterface {
  name = 'AddMediaToAutoMessage1749168000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'messages_predefinis',
      new TableColumn({ name: 'media_asset_id', type: 'varchar', length: '36', isNullable: true }),
    );
    await queryRunner.createForeignKey(
      'messages_predefinis',
      new TableForeignKey({
        columnNames: ['media_asset_id'],
        referencedTableName: 'media_asset',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        name: 'FK_messages_predefinis_media_asset_id',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('messages_predefinis', 'FK_messages_predefinis_media_asset_id');
    await queryRunner.dropColumn('messages_predefinis', 'media_asset_id');
  }
}
