import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class CommercialPhone1745500000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasPhone = await qr.hasColumn('whatsapp_commercial', 'phone');
    if (!hasPhone) {
      await qr.addColumn(
        'whatsapp_commercial',
        new TableColumn({
          name: 'phone',
          type: 'varchar',
          length: '50',
          isNullable: true,
          default: null,
        }),
      );
      await qr.createIndex(
        'whatsapp_commercial',
        new TableIndex({
          name: 'IDX_commercial_phone',
          columnNames: ['phone'],
          isUnique: true,
        }),
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasPhone = await qr.hasColumn('whatsapp_commercial', 'phone');
    if (hasPhone) {
      await qr.dropIndex('whatsapp_commercial', 'IDX_commercial_phone');
      await qr.dropColumn('whatsapp_commercial', 'phone');
    }
  }
}
