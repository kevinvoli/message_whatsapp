import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Phase 5b — SLA Rules + Audit Log
 * Pas de contact_field_* ici (déjà dans 20260416_phase5_features.ts)
 */
export class Phase5bFeatures1744761600004 implements MigrationInterface {
  name = 'Phase5bFeatures1744761600004';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── sla_rule ──────────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('sla_rule'))) {
      await queryRunner.createTable(
        new Table({
          name: 'sla_rule',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'tenant_id', type: 'char', length: '36', isNullable: false },
            { name: 'name', type: 'varchar', length: '100', isNullable: false },
            {
              name: 'metric',
              type: 'enum',
              enum: ['first_response', 'resolution', 'reengagement'],
              isNullable: false,
            },
            { name: 'threshold_seconds', type: 'int unsigned', isNullable: false },
            {
              name: 'severity',
              type: 'enum',
              enum: ['warning', 'breach'],
              default: "'warning'",
            },
            { name: 'notify_admin', type: 'boolean', default: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_sla_tenant', columnNames: ['tenant_id'] },
            { name: 'IDX_sla_tenant_metric', columnNames: ['tenant_id', 'metric'], isUnique: true },
          ],
        }),
        true,
      );
    }

    // ─── audit_log ────────────────────────────────────────────────────────────
    if (!(await queryRunner.hasTable('audit_log'))) {
      await queryRunner.createTable(
        new Table({
          name: 'audit_log',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true, generationStrategy: 'uuid', default: '(UUID())' },
            { name: 'tenant_id', type: 'char', length: '36', isNullable: true },
            { name: 'actor_id', type: 'char', length: '36', isNullable: true },
            { name: 'actor_name', type: 'varchar', length: '100', isNullable: true },
            { name: 'actor_type', type: 'varchar', length: '20', isNullable: true },
            {
              name: 'action',
              type: 'enum',
              enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'SEND_MESSAGE', 'ASSIGN', 'TRANSFER', 'CLOSE', 'REOPEN', 'EXPORT'],
              isNullable: false,
            },
            { name: 'entity_type', type: 'varchar', length: '100', isNullable: true },
            { name: 'entity_id', type: 'char', length: '36', isNullable: true },
            { name: 'diff', type: 'json', isNullable: true },
            { name: 'meta', type: 'json', isNullable: true },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_audit_tenant_time', columnNames: ['tenant_id', 'created_at'] },
            { name: 'IDX_audit_actor', columnNames: ['actor_id', 'created_at'] },
            { name: 'IDX_audit_entity', columnNames: ['entity_type', 'entity_id'] },
          ],
        }),
        true,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('audit_log')) {
      await queryRunner.dropTable('audit_log', true);
    }
    if (await queryRunner.hasTable('sla_rule')) {
      await queryRunner.dropTable('sla_rule', true);
    }
  }
}
