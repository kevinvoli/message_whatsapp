import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPendingMessagePayload1739440000001
  implements MigrationInterface
{
  name = 'AddPendingMessagePayload1739440000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('pending_messages');
    const hasPayload = table?.columns?.some((c) => c.name === 'payload');
    if (hasPayload) {
      return;
    }

    await queryRunner.addColumn(
      'pending_messages',
      new TableColumn({
        name: 'payload',
        type: 'longtext',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('pending_messages');
    const hasPayload = table?.columns?.some((c) => c.name === 'payload');
    if (!hasPayload) {
      return;
    }
    await queryRunner.dropColumn('pending_messages', 'payload');
  }
}
