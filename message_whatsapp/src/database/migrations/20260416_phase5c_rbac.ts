import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * Phase 5c — RBAC : role + commercial_role
 */
export class Phase5cRbac1744761600005 implements MigrationInterface {
  name = 'Phase5cRbac1744761600005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── role ──────────────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('role'))) {
      await queryRunner.createTable(
        new Table({
          name: 'role',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'tenant_id', type: 'char', length: '36', isNullable: false },
            { name: 'name', type: 'varchar', length: '60', isNullable: false },
            { name: 'description', type: 'varchar', length: '255', isNullable: true },
            { name: 'permissions', type: 'json', isNullable: false, default: "'[]'" },
            { name: 'is_system', type: 'boolean', default: false },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_role_tenant', columnNames: ['tenant_id'] },
            { name: 'UQ_role_tenant_name', columnNames: ['tenant_id', 'name'], isUnique: true },
          ],
        }),
        true,
      );
    }

    // ─── commercial_role ──────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('commercial_role'))) {
      await queryRunner.createTable(
        new Table({
          name: 'commercial_role',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'commercial_id', type: 'char', length: '36', isNullable: false },
            { name: 'tenant_id', type: 'char', length: '36', isNullable: false },
            { name: 'role_id', type: 'char', length: '36', isNullable: false },
            { name: 'assigned_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_comrole_commercial', columnNames: ['commercial_id'] },
            { name: 'IDX_comrole_role', columnNames: ['role_id'] },
            { name: 'UQ_comrole_commercial_tenant', columnNames: ['commercial_id', 'tenant_id'], isUnique: true },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'commercial_role',
        new TableForeignKey({
          name: 'FK_comrole_role',
          columnNames: ['role_id'],
          referencedTableName: 'role',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_role')) {
      await queryRunner.dropTable('commercial_role', true);
    }
    if (await queryRunner.hasTable('role')) {
      await queryRunner.dropTable('role', true);
    }
  }
}
