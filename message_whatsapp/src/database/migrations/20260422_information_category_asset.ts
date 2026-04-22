import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class InformationCategoryAsset1745683200001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('information_category_asset')) return;

    await qr.createTable(
      new Table({
        name: 'information_category_asset',
        columns: [
          { name: 'id', type: 'char', length: '36', isPrimary: true },
          {
            name: 'category',
            type: 'enum',
            enum: ['produit', 'service', 'promo', 'info'],
            isNullable: false,
          },
          {
            name: 'media_type',
            type: 'enum',
            enum: ['image', 'video', 'document', 'audio'],
            isNullable: false,
          },
          { name: 'title', type: 'varchar', length: '200', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'media_url', type: 'varchar', length: '1000', isNullable: false },
          { name: 'text_template', type: 'text', isNullable: true },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          { name: 'sort_order', type: 'int', default: 0 },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          { name: 'IDX_asset_category_active', columnNames: ['category', 'is_active'] },
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('information_category_asset', true);
  }
}
