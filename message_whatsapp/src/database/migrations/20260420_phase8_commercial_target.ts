import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class Phase8CommercialTarget1745200000001 implements MigrationInterface {
  name = 'Phase8CommercialTarget1745200000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_target')) return;

    await queryRunner.createTable(
      new Table({
        name: 'commercial_target',
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
            name: 'commercial_id',
            type: 'char',
            length: '36',
            isNullable: false,
          },
          {
            name: 'commercial_name',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'period_type',
            type: 'enum',
            enum: ['day', 'week', 'month', 'quarter'],
            isNullable: false,
          },
          {
            name: 'period_start',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'metric',
            type: 'enum',
            enum: ['conversations', 'calls', 'follow_ups', 'orders', 'relances'],
            isNullable: false,
          },
          {
            name: 'target_value',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '200',
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
          { name: 'IDX_target_commercial_id', columnNames: ['commercial_id'] },
          { name: 'IDX_target_period', columnNames: ['period_type', 'period_start'] },
          {
            name: 'UQ_target_commercial_period_metric',
            columnNames: ['commercial_id', 'period_type', 'period_start', 'metric'],
            isUnique: true,
          },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_target')) {
      await queryRunner.dropTable('commercial_target');
    }
  }
}
