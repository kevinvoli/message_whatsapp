import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class IntegrationSyncLog1745942400004 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('integration_sync_log')) return;

    await qr.createTable(new Table({
      name: 'integration_sync_log',
      columns: [
        { name: 'id',           type: 'char',    length: '36',  isPrimary: true },
        { name: 'entity_type',  type: 'varchar', length: '50',  isNullable: false },
        { name: 'entity_id',    type: 'varchar', length: '36',  isNullable: false },
        { name: 'target_table', type: 'varchar', length: '100', isNullable: false },
        {
          name:    'status',
          type:    'enum',
          enum:    ['pending', 'success', 'failed'],
          default: "'pending'",
        },
        { name: 'attempt_count', type: 'int',       default: '0',   isNullable: false },
        { name: 'last_error',    type: 'text',       isNullable: true },
        { name: 'synced_at',     type: 'timestamp',  isNullable: true },
        { name: 'created_at',    type: 'timestamp',  default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at',    type: 'timestamp',  default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
      ],
      indices: [
        { name: 'IDX_sync_log_entity',  columnNames: ['entity_type', 'entity_id'] },
        { name: 'IDX_sync_log_status',  columnNames: ['status', 'created_at'] },
        { name: 'IDX_sync_log_pending', columnNames: ['status', 'attempt_count'] },
      ],
    }));
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('integration_sync_log')) {
      await qr.dropTable('integration_sync_log');
    }
  }
}
