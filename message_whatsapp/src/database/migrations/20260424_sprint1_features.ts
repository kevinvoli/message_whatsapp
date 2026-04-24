import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class Sprint1Features1745942400001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const add = async (table: string, col: TableColumn) => {
      if (!(await qr.hasColumn(table, col.name))) {
        await qr.addColumn(table, col);
      }
    };

    // ── conversation_report : statut de soumission plateforme commandes ──
    await add('conversation_report', new TableColumn({
      name: 'submission_status',
      type: 'enum',
      enum: ['pending', 'sent', 'failed'],
      isNullable: true,
      default: null,
    }));
    await add('conversation_report', new TableColumn({
      name: 'submitted_at',
      type: 'timestamp',
      isNullable: true,
      default: null,
    }));
    await add('conversation_report', new TableColumn({
      name: 'submission_error',
      type: 'text',
      isNullable: true,
    }));

    // ── call_event : email commercial pour résolution par fallback ────────
    await add('call_event', new TableColumn({
      name: 'commercial_email',
      type: 'varchar',
      length: '200',
      isNullable: true,
      default: null,
    }));

    // ── closure_attempt_log : journal des tentatives de fermeture ─────────
    if (!(await qr.hasTable('closure_attempt_log'))) {
      await qr.createTable(new Table({
        name: 'closure_attempt_log',
        columns: [
          { name: 'id', type: 'char', length: '36', isPrimary: true },
          { name: 'chat_id', type: 'varchar', length: '100', isNullable: false },
          { name: 'commercial_id', type: 'char', length: '36', isNullable: true },
          { name: 'blockers', type: 'json', isNullable: true },
          { name: 'was_blocked', type: 'tinyint', width: 1, default: '1' },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          { name: 'IDX_closure_log_chat_id', columnNames: ['chat_id'] },
        ],
      }));
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('closure_attempt_log')) {
      await qr.dropTable('closure_attempt_log');
    }
    for (const col of ['submission_status', 'submitted_at', 'submission_error']) {
      if (await qr.hasColumn('conversation_report', col)) {
        await qr.dropColumn('conversation_report', col);
      }
    }
    if (await qr.hasColumn('call_event', 'commercial_email')) {
      await qr.dropColumn('call_event', 'commercial_email');
    }
  }
}
