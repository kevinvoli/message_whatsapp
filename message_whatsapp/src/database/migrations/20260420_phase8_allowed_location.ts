import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class Phase8AllowedLocation1745200000003 implements MigrationInterface {
  name = 'Phase8AllowedLocation1745200000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('allowed_location')) return;

    await queryRunner.createTable(
      new Table({
        name: 'allowed_location',
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
            name: 'label',
            type: 'varchar',
            length: '200',
            isNullable: false,
          },
          {
            name: 'latitude',
            type: 'decimal',
            precision: 10,
            scale: 7,
            isNullable: false,
          },
          {
            name: 'longitude',
            type: 'decimal',
            precision: 10,
            scale: 7,
            isNullable: false,
          },
          {
            name: 'radius_km',
            type: 'int',
            default: 200,
            isNullable: false,
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
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('allowed_location')) {
      await queryRunner.dropTable('allowed_location');
    }
  }
}
