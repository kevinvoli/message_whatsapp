import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class OrderCallSyncCursor1745942400005 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('order_call_sync_cursor')) return;

    await qr.createTable(new Table({
      name: 'order_call_sync_cursor',
      columns: [
        { name: 'scope',               type: 'varchar', length: '50', isPrimary: true },
        { name: 'last_call_timestamp', type: 'datetime',  isNullable: true },
        { name: 'last_call_id',        type: 'varchar', length: '36', isNullable: true },
        { name: 'processed_count',     type: 'bigint',   default: '0' },
        { name: 'updated_at',          type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
      ],
    }));
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('order_call_sync_cursor')) {
      await qr.dropTable('order_call_sync_cursor');
    }
  }
}
