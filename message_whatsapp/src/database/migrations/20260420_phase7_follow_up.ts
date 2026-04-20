import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Phase 7 — Fondations de suivi client
 * P7.3 — Table follow_up (relances commerciales)
 *
 * Nouvelle table : aucun impact sur les tables existantes.
 */
export class Phase7FollowUp1745100000003 implements MigrationInterface {
  name = 'Phase7FollowUp1745100000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('follow_up')) return;

    await queryRunner.createTable(
      new Table({
        name: 'follow_up',
        columns: [
          {
            name: 'id',
            type: 'char',
            length: '36',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: '(UUID())',
          },
          {
            name: 'contact_id',
            type: 'char',
            length: '36',
            isNullable: true,
          },
          {
            name: 'conversation_id',
            type: 'char',
            length: '36',
            isNullable: true,
          },
          {
            name: 'commercial_id',
            type: 'char',
            length: '36',
            isNullable: true,
          },
          {
            name: 'commercial_name',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: [
              'rappel',
              'relance_post_conversation',
              'relance_sans_commande',
              'relance_post_annulation',
              'relance_fidelisation',
              'relance_sans_reponse',
            ],
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['planifiee', 'en_retard', 'effectuee', 'annulee'],
            default: "'planifiee'",
            isNullable: false,
          },
          {
            name: 'scheduled_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'datetime',
            isNullable: true,
            default: null,
          },
        ],
        indices: [
          { name: 'IDX_follow_up_contact_id', columnNames: ['contact_id'] },
          { name: 'IDX_follow_up_commercial_id', columnNames: ['commercial_id'] },
          { name: 'IDX_follow_up_scheduled_at', columnNames: ['scheduled_at'] },
          { name: 'IDX_follow_up_status', columnNames: ['status'] },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('follow_up')) {
      await queryRunner.dropTable('follow_up');
    }
  }
}
