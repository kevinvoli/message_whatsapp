import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class OutboundHsmV2_1746000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'whatsapp_template',
      new TableColumn({
        name: 'rejection_reason',
        type: 'varchar',
        length: '500',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('whatsapp_template', 'rejection_reason');
  }
}
