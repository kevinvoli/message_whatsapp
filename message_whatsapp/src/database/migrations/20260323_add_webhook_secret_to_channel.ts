import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWebhookSecretToChannel1742774400000 implements MigrationInterface {
  name = 'AddWebhookSecretToChannel1742774400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'webhook_secret',
        type: 'varchar',
        length: '128',
        isNullable: true,
        default: null,
      }),
    );
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'verify_token',
        type: 'varchar',
        length: '128',
        isNullable: true,
        default: null,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whapi_channels', 'verify_token');
    await queryRunner.dropColumn('whapi_channels', 'webhook_secret');
  }
}
