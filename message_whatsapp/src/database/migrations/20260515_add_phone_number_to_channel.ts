import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPhoneNumberToChannel1747267200001 implements MigrationInterface {
  name = 'AddPhoneNumberToChannel1747267200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whapi_channels',
      new TableColumn({
        name: 'phone_number',
        type: 'varchar',
        length: '32',
        isNullable: true,
        default: null,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whapi_channels', 'phone_number');
  }
}
