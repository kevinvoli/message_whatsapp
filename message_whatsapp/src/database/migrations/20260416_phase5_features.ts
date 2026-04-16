import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Phase 5 — CRM Custom Fields
 * contact_field_definition : schéma CRM par tenant
 * contact_field_value       : valeurs polymorphiques par contact
 */
export class Phase5Features1744761600003 implements MigrationInterface {
  name = 'Phase5Features1744761600003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── contact_field_definition ─────────────────────────────────────────────
    if (!(await queryRunner.hasTable('contact_field_definition'))) {
      await queryRunner.createTable(
        new Table({
          name: 'contact_field_definition',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'tenant_id', type: 'char', length: '36', isNullable: false },
            { name: 'name', type: 'varchar', length: '100', isNullable: false },
            { name: 'field_key', type: 'varchar', length: '50', isNullable: false },
            {
              name: 'field_type',
              type: 'enum',
              enum: ['text', 'number', 'date', 'boolean', 'select', 'multiselect'],
              default: "'text'",
            },
            { name: 'options', type: 'json', isNullable: true },
            { name: 'required', type: 'boolean', default: false },
            { name: 'position', type: 'int', default: 0 },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_cfd_tenant', columnNames: ['tenant_id'] },
            { name: 'UQ_cfd_tenant_key', columnNames: ['tenant_id', 'field_key'], isUnique: true },
          ],
        }),
        true,
      );
    }

    // ─── contact_field_value ──────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('contact_field_value'))) {
      await queryRunner.createTable(
        new Table({
          name: 'contact_field_value',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'contact_id', type: 'char', length: '36', isNullable: false },
            { name: 'field_id', type: 'char', length: '36', isNullable: false },
            { name: 'value_text', type: 'text', isNullable: true },
            { name: 'value_number', type: 'decimal', precision: 15, scale: 4, isNullable: true },
            { name: 'value_date', type: 'date', isNullable: true },
            { name: 'value_boolean', type: 'tinyint', isNullable: true },
            { name: 'value_json', type: 'json', isNullable: true },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_cfv_contact', columnNames: ['contact_id'] },
            { name: 'IDX_cfv_field', columnNames: ['field_id'] },
            { name: 'UQ_cfv_contact_field', columnNames: ['contact_id', 'field_id'], isUnique: true },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'contact_field_value',
        new TableForeignKey({
          name: 'FK_cfv_field_def',
          columnNames: ['field_id'],
          referencedTableName: 'contact_field_definition',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('contact_field_value')) {
      await queryRunner.dropTable('contact_field_value', true);
    }
    if (await queryRunner.hasTable('contact_field_definition')) {
      await queryRunner.dropTable('contact_field_definition', true);
    }
  }
}
