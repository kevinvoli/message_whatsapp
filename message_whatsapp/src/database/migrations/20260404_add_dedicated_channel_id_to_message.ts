import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDedicatedChannelIdToMessage1743724800000 implements MigrationInterface {
  name = 'AddDedicatedChannelIdToMessage1743724800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whatsapp_message',
      new TableColumn({
        name: 'dedicated_channel_id',
        type: 'varchar',
        length: '100',
        isNullable: true,
        default: null,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whatsapp_message', 'dedicated_channel_id');
  }
}
