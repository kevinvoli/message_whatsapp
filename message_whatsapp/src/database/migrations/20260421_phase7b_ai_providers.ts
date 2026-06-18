import { MigrationInterface, QueryRunner, Table } from 'typeorm';

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

    // ai_module_config created via raw SQL in Phase7AiGovernance — not in TypeORM cache
    if (!(await qr.hasColumn('ai_module_config', 'provider_id'))) {
      await qr.query('ALTER TABLE `ai_module_config` ADD COLUMN `provider_id` CHAR(36) NULL');
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('ai_module_config', 'provider_id')) {
      await qr.query('ALTER TABLE `ai_module_config` DROP COLUMN `provider_id`');
    }
    await qr.dropTable('ai_provider');
  }
}
