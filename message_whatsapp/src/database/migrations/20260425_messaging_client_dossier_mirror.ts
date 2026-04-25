import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class MessagingClientDossierMirror1746028800001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('messaging_client_dossier_mirror')) return;

    await qr.createTable(
      new Table({
        name: 'messaging_client_dossier_mirror',
        columns: [
          // ── Clé primaire : chat_id DB1 ───────────────────────────────────
          {
            name: 'messaging_chat_id',
            type: 'varchar',
            length: '100',
            isPrimary: true,
          },

          // ── Mapping DB2 (optionnel) ───────────────────────────────────────
          {
            name: 'id_client',
            type: 'int',
            isNullable: true,
            default: null,
          },
          {
            name: 'id_commercial',
            type: 'int',
            isNullable: true,
            default: null,
          },

          // ── Contact messagerie ────────────────────────────────────────────
          {
            name: 'client_messaging_contact',
            type: 'varchar',
            length: '200',
            isNullable: true,
            default: null,
          },
          {
            name: 'client_phones',
            type: 'text',
            isNullable: true,
          },

          // ── Données rapport / dossier ─────────────────────────────────────
          {
            name: 'client_name',
            type: 'varchar',
            length: '200',
            isNullable: true,
            default: null,
          },
          {
            name: 'commercial_name',
            type: 'varchar',
            length: '200',
            isNullable: true,
            default: null,
          },
          {
            name: 'commercial_phone',
            type: 'varchar',
            length: '30',
            isNullable: true,
            default: null,
          },
          {
            name: 'commercial_email',
            type: 'varchar',
            length: '200',
            isNullable: true,
            default: null,
          },
          {
            name: 'ville',
            type: 'varchar',
            length: '100',
            isNullable: true,
            default: null,
          },
          {
            name: 'commune',
            type: 'varchar',
            length: '100',
            isNullable: true,
            default: null,
          },
          {
            name: 'quartier',
            type: 'varchar',
            length: '100',
            isNullable: true,
            default: null,
          },
          {
            name: 'product_category',
            type: 'varchar',
            length: '200',
            isNullable: true,
            default: null,
          },
          {
            name: 'client_need',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'interest_score',
            type: 'tinyint',
            isNullable: true,
            default: null,
          },
          {
            name: 'next_action',
            type: 'varchar',
            length: '50',
            isNullable: true,
            default: null,
          },
          {
            name: 'follow_up_at',
            type: 'datetime',
            isNullable: true,
            default: null,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },

          // ── Fermeture ────────────────────────────────────────────────────
          {
            name: 'conversation_result',
            type: 'varchar',
            length: '50',
            isNullable: true,
            default: null,
          },
          {
            name: 'closed_at',
            type: 'datetime',
            isNullable: true,
            default: null,
          },

          // ── Statut sync ──────────────────────────────────────────────────
          {
            name: 'sync_status',
            type: 'enum',
            enum: ['pending', 'synced', 'error'],
            default: "'pending'",
          },
          {
            name: 'sync_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'submitted_at',
            type: 'datetime',
            isNullable: true,
            default: null,
          },

          // ── Audit ────────────────────────────────────────────────────────
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_mirror_id_client',
            columnNames: ['id_client'],
          },
          {
            name: 'IDX_mirror_id_commercial',
            columnNames: ['id_commercial'],
          },
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('messaging_client_dossier_mirror', true);
  }
}
