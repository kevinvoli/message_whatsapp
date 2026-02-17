import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddDispatchSettings1739440000002 implements MigrationInterface {
  name = 'AddDispatchSettings1739440000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('dispatch_settings');
    if (!exists) {
      await queryRunner.createTable(
        new Table({
          name: 'dispatch_settings',
          columns: [
            {
              name: 'id',
              type: 'char',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'no_reply_reinject_interval_minutes',
              type: 'int',
              default: 5,
            },
            {
              name: 'pending_dispatch_interval_minutes',
              type: 'int',
              default: 1,
            },
            {
              name: 'read_only_check_interval_minutes',
              type: 'int',
              default: 10,
            },
            {
              name: 'offline_reinject_cron',
              type: 'varchar',
              length: '100',
              default: "'0 9 * * *'",
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('dispatch_settings');
    if (exists) {
      await queryRunner.dropTable('dispatch_settings');
    }
  }
}
