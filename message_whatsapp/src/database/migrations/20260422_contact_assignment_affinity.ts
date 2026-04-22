import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class ContactAssignmentAffinity1745510400001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const exists = await qr.hasTable('contact_assignment_affinity');
    if (exists) return;

    await qr.createTable(
      new Table({
        name: 'contact_assignment_affinity',
        columns: [
          { name: 'id', type: 'char', length: '36', isPrimary: true },
          { name: 'chat_id', type: 'varchar', length: '100', isNullable: false },
          { name: 'poste_id', type: 'char', length: '36', isNullable: false },
          { name: 'is_active', type: 'tinyint', width: 1, default: 0 },
          { name: 'conversation_count', type: 'int', default: 1 },
          { name: 'last_assigned_at', type: 'timestamp', isNullable: false },
          { name: 'released_at', type: 'timestamp', isNullable: true, default: null },
          { name: 'release_reason', type: 'varchar', length: '50', isNullable: true, default: null },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          { name: 'IDX_affinity_chat_active', columnNames: ['chat_id', 'is_active'] },
          { name: 'IDX_affinity_poste_active', columnNames: ['poste_id', 'is_active'] },
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('contact_assignment_affinity', true);
  }
}
