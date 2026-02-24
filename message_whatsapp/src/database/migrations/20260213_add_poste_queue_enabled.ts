import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPosteQueueEnabled1739440000000 implements MigrationInterface {
  name = 'AddPosteQueueEnabled1739440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'whatsapp_poste',
      'is_queue_enabled',
    );
    if (!hasColumn) {
      await queryRunner.addColumn(
        'whatsapp_poste',
        new TableColumn({
          name: 'is_queue_enabled',
          type: 'tinyint',
          width: 1,
          isNullable: false,
          default: 1,
        }),
      );
    }

    await queryRunner.query(
      'UPDATE `whatsapp_poste` SET `is_queue_enabled` = 1 WHERE `is_queue_enabled` IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'whatsapp_poste',
      'is_queue_enabled',
    );
    if (hasColumn) {
      await queryRunner.dropColumn('whatsapp_poste', 'is_queue_enabled');
    }
  }
}
