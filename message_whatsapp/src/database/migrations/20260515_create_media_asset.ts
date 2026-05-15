import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateMediaAsset1778803200001 implements MigrationInterface {
  name = 'CreateMediaAsset1778803200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'media_asset',
        columns: [
          { name: 'id',            type: 'varchar',  length: '36',  isPrimary: true },
          { name: 'name',          type: 'varchar',  length: '255', isNullable: false },
          { name: 'original_name', type: 'varchar',  length: '255', isNullable: false },
          { name: 'file_path',     type: 'varchar',  length: '500', isNullable: false },
          { name: 'public_url',    type: 'varchar',  length: '500', isNullable: false },
          { name: 'mime_type',     type: 'varchar',  length: '100', isNullable: false },
          {
            name: 'media_type',
            type: 'enum',
            enum: ['image', 'video', 'audio', 'document'],
            isNullable: false,
          },
          { name: 'file_size',     type: 'int',                    isNullable: false },
          { name: 'category',      type: 'varchar',  length: '100', isNullable: true },
          { name: 'tags',          type: 'json',                   isNullable: true },
          { name: 'color_label',   type: 'varchar',  length: '7',   isNullable: true },
          { name: 'usage_count',   type: 'int',                    isNullable: false, default: '0' },
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
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('media_asset');
  }
}
