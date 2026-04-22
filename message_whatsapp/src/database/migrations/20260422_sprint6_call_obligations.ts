import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class Sprint6CallObligations1745769600001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── 1. commercial_obligation_batch ──────────────────────────────────────
    if (!(await qr.hasTable('commercial_obligation_batch'))) {
      await qr.createTable(
        new Table({
          name: 'commercial_obligation_batch',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true },
            { name: 'poste_id', type: 'char', length: '36', isNullable: false },
            { name: 'batch_number', type: 'int', default: 1 },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'complete'],
              default: "'pending'",
            },
            { name: 'annulee_done', type: 'int', default: 0 },
            { name: 'livree_done', type: 'int', default: 0 },
            { name: 'sans_commande_done', type: 'int', default: 0 },
            { name: 'quality_check_passed', type: 'tinyint', width: 1, default: 0 },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'completed_at', type: 'timestamp', isNullable: true, default: null },
          ],
          indices: [
            { name: 'IDX_batch_poste_status', columnNames: ['poste_id', 'status'] },
          ],
        }),
        true,
      );
    }

    // ── 2. call_task ────────────────────────────────────────────────────────
    if (!(await qr.hasTable('call_task'))) {
      await qr.createTable(
        new Table({
          name: 'call_task',
          columns: [
            { name: 'id', type: 'char', length: '36', isPrimary: true },
            { name: 'batch_id', type: 'char', length: '36', isNullable: false },
            { name: 'poste_id', type: 'char', length: '36', isNullable: false },
            {
              name: 'category',
              type: 'enum',
              enum: ['commande_annulee', 'commande_avec_livraison', 'jamais_commande'],
              isNullable: false,
            },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'done'],
              default: "'pending'",
            },
            { name: 'client_phone', type: 'varchar', length: '50', isNullable: true, default: null },
            { name: 'call_event_id', type: 'varchar', length: '100', isNullable: true, default: null },
            { name: 'duration_seconds', type: 'int', isNullable: true, default: null },
            { name: 'completed_at', type: 'timestamp', isNullable: true, default: null },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_call_task_batch_cat', columnNames: ['batch_id', 'category', 'status'] },
            { name: 'IDX_call_task_poste', columnNames: ['poste_id', 'status'] },
          ],
        }),
        true,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('call_task', true);
    await qr.dropTable('commercial_obligation_batch', true);
  }
}
