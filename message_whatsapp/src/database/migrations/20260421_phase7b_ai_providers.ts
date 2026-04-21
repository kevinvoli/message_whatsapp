import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class Phase7bAiProviders1745372800001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.createTable(
      new Table({
        name: 'ai_provider',
        columns: [
          { name: 'id', type: 'char', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar', length: '100', isNullable: false },
          { name: 'provider_type', type: 'varchar', length: '20', isNullable: false },
          { name: 'model', type: 'varchar', length: '100', isNullable: false },
          { name: 'api_key', type: 'varchar', length: '500', isNullable: true },
          { name: 'api_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'timeout_ms', type: 'int', default: 30000 },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await qr.addColumn(
      'ai_module_config',
      new TableColumn({ name: 'provider_id', type: 'char', length: '36', isNullable: true }),
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropColumn('ai_module_config', 'provider_id');
    await qr.dropTable('ai_provider');
  }
}
