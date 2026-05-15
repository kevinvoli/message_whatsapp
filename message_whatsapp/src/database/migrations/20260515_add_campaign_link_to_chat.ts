import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCampaignLinkToChat1747267200004 implements MigrationInterface {
  name = 'AddCampaignLinkToChat1747267200004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whatsapp_chat',
      new TableColumn({
        name: 'campaign_link_id',
        type: 'char',
        length: '36',
        isNullable: true,
        default: null,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whatsapp_chat', 'campaign_link_id');
  }
}
