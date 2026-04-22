import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class GicopConversationReport1745596800001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('conversation_report')) return;

    await qr.createTable(
      new Table({
        name: 'conversation_report',
        columns: [
          { name: 'id', type: 'char', length: '36', isPrimary: true },
          { name: 'chat_id', type: 'varchar', length: '100', isNullable: false },
          { name: 'commercial_id', type: 'char', length: '36', isNullable: true, default: null },
          { name: 'poste_id', type: 'char', length: '36', isNullable: true, default: null },
          {
            name: 'client_interest',
            type: 'enum',
            enum: ['tres_interesse', 'interesse', 'peu_interesse', 'pas_interesse'],
            isNullable: true,
            default: null,
          },
          { name: 'has_order', type: 'tinyint', width: 1, isNullable: true, default: null },
          {
            name: 'next_action',
            type: 'enum',
            enum: ['rappeler', 'envoyer_devis', 'relancer', 'fermer', 'archiver'],
            isNullable: true,
            default: null,
          },
          { name: 'order_amount', type: 'decimal', precision: 12, scale: 2, isNullable: true, default: null },
          { name: 'next_action_at', type: 'timestamp', isNullable: true, default: null },
          { name: 'objections', type: 'text', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'is_complete', type: 'tinyint', width: 1, default: 0 },
          { name: 'is_validated', type: 'tinyint', width: 1, default: 0 },
          { name: 'validated_at', type: 'timestamp', isNullable: true, default: null },
          { name: 'validated_by_id', type: 'char', length: '36', isNullable: true, default: null },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          { name: 'UQ_report_chat_id', columnNames: ['chat_id'], isUnique: true },
          { name: 'IDX_report_poste_id', columnNames: ['poste_id'] },
          { name: 'IDX_report_is_complete', columnNames: ['is_complete'] },
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('conversation_report', true);
  }
}
