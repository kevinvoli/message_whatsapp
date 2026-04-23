import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class ClientDossier1745856000002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('client_dossier')) return;

    await qr.createTable(
      new Table({
        name: 'client_dossier',
        columns: [
          {
            name: 'id',
            type: 'char',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'contact_id',
            type: 'char',
            length: '36',
            isNullable: false,
          },
          // Identification
          {
            name: 'full_name',
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
            name: 'other_phones',
            type: 'text',
            isNullable: true,
          },
          // Intérêt produit
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
            name: 'is_male_not_interested',
            type: 'tinyint',
            width: 1,
            default: 0,
          },
          // Suivi
          {
            name: 'follow_up_at',
            type: 'timestamp',
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
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_dossier_contact_id',
            columnNames: ['contact_id'],
            isUnique: true,
          },
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('client_dossier', true);
  }
}
