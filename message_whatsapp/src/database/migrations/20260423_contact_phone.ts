import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class ContactPhone1745856000003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('contact_phone')) return;

    await qr.createTable(
      new Table({
        name: 'contact_phone',
        columns: [
          { name: 'id',         type: 'char',    length: '36',  isPrimary: true },
          { name: 'contact_id', type: 'char',    length: '36',  isNullable: false },
          { name: 'phone',      type: 'varchar', length: '50',  isNullable: false },
          { name: 'label',      type: 'varchar', length: '100', isNullable: true, default: null },
          { name: 'is_primary', type: 'tinyint', width: 1,      default: '0' },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          { name: 'IDX_contact_phone_contact_id', columnNames: ['contact_id'] },
          { name: 'IDX_contact_phone_phone',      columnNames: ['phone'] },
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('contact_phone', true);
  }
}
