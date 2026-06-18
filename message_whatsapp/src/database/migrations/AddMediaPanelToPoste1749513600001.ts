import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMediaPanelToPoste1749513600001 implements MigrationInterface {
  name = 'AddMediaPanelToPoste1749513600001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whatsapp_poste');

    if (!table?.findColumnByName('media_panel_enabled')) {
      await queryRunner.addColumn(
        'whatsapp_poste',
        new TableColumn({
          name: 'media_panel_enabled',
          type: 'tinyint',
          width: 1,
          isNullable: false,
          default: 0,
        }),
      );
    }

    if (!table?.findColumnByName('media_panel_types')) {
      await queryRunner.addColumn(
        'whatsapp_poste',
        new TableColumn({
          name: 'media_panel_types',
          type: 'varchar',
          length: '255',
          isNullable: true,
          default: null,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('whatsapp_poste');
    if (table?.findColumnByName('media_panel_types')) {
      await queryRunner.dropColumn('whatsapp_poste', 'media_panel_types');
    }
    if (table?.findColumnByName('media_panel_enabled')) {
      await queryRunner.dropColumn('whatsapp_poste', 'media_panel_enabled');
    }
  }
}
