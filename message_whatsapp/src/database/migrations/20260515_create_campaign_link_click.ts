import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateCampaignLinkClick1747267200003 implements MigrationInterface {
  name = 'CreateCampaignLinkClick1747267200003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'campaign_link_click',
        columns: [
          { name: 'id',               type: 'char',      length: '36',  isPrimary: true },
          { name: 'campaign_link_id', type: 'char',      length: '36',  isNullable: false },
          { name: 'clicked_at',       type: 'timestamp',                default: 'CURRENT_TIMESTAMP' },
          { name: 'ip_hash',          type: 'varchar',   length: '64',  isNullable: true, default: null },
          { name: 'user_agent',       type: 'text',                     isNullable: true },
          { name: 'device_type',      type: 'varchar',   length: '16',  isNullable: true, default: null },
          { name: 'converted',        type: 'tinyint',                  default: '0' },
          { name: 'converted_at',     type: 'timestamp',                isNullable: true, default: null },
          { name: 'chat_id',          type: 'varchar',   length: '100', isNullable: true, default: null },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'campaign_link_click',
      new TableIndex({
        name: 'IDX_click_link_date',
        columnNames: ['campaign_link_id', 'clicked_at'],
      }),
    );

    await queryRunner.createForeignKey(
      'campaign_link_click',
      new TableForeignKey({
        name: 'FK_click_campaign_link',
        columnNames: ['campaign_link_id'],
        referencedTableName: 'campaign_link',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('campaign_link_click', 'FK_click_campaign_link');
    await queryRunner.dropIndex('campaign_link_click', 'IDX_click_link_date');
    await queryRunner.dropTable('campaign_link_click');
  }
}
