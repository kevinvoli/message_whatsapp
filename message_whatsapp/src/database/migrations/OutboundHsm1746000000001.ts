import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class OutboundHsm1746000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'whatsapp_template',
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
            name: 'channel_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'language',
            type: 'varchar',
            length: '10',
            isNullable: false,
            default: "'fr'",
          },
          {
            name: 'category',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'APPROVED', 'REJECTED'],
            isNullable: false,
            default: "'PENDING'",
          },
          {
            name: 'components',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'external_id',
            type: 'varchar',
            length: '191',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            isNullable: false,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            isNullable: false,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['channel_id'],
            referencedTableName: 'whapi_channels',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'whatsapp_template',
      new TableIndex({
        name: 'IDX_whatsapp_template_channel_id',
        columnNames: ['channel_id'],
      }),
    );

    await queryRunner.createIndex(
      'whatsapp_template',
      new TableIndex({
        name: 'IDX_whatsapp_template_channel_status',
        columnNames: ['channel_id', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'whatsapp_template',
      'IDX_whatsapp_template_channel_status',
    );
    await queryRunner.dropIndex(
      'whatsapp_template',
      'IDX_whatsapp_template_channel_id',
    );
    await queryRunner.dropTable('whatsapp_template');
  }
}
