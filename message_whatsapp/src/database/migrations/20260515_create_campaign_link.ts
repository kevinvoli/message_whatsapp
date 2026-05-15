import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCampaignLink1747267200002 implements MigrationInterface {
  name = 'CreateCampaignLink1747267200002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'campaign_link',
        columns: [
          { name: 'id',                 type: 'char',      length: '36',  isPrimary: true },
          { name: 'name',               type: 'varchar',   length: '100', isNullable: false },
          { name: 'channel_id',         type: 'varchar',   length: '100', isNullable: false },
          { name: 'predefined_message', type: 'text',                     isNullable: false },
          { name: 'short_code',         type: 'varchar',   length: '16',  isNullable: false, isUnique: true },
          { name: 'direct_url',         type: 'text',                     isNullable: false },
          { name: 'tracked_url',        type: 'text',                     isNullable: false },
          { name: 'click_count',        type: 'int',                      default: '0' },
          { name: 'conversion_count',   type: 'int',                      default: '0' },
          { name: 'is_active',          type: 'tinyint',                  default: '1' },
          { name: 'createdAt',          type: 'timestamp',                default: 'CURRENT_TIMESTAMP' },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('campaign_link');
  }
}
