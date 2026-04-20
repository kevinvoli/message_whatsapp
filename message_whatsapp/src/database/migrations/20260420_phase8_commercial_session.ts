import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class Phase8CommercialSession1745200000002 implements MigrationInterface {
  name = 'Phase8CommercialSession1745200000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_session')) return;

    await queryRunner.createTable(
      new Table({
        name: 'commercial_session',
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
            name: 'connected_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'disconnected_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'duration_seconds',
            type: 'int',
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
        ],
        indices: [
          { name: 'IDX_session_commercial_id', columnNames: ['commercial_id'] },
          { name: 'IDX_session_connected_at', columnNames: ['connected_at'] },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commercial_session')) {
      await queryRunner.dropTable('commercial_session');
    }
  }
}
