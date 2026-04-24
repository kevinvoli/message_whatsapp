import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class Sprint3CallTreated1745942400003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('call_log', 'treated'))) {
      await qr.addColumn('call_log', new TableColumn({
        name: 'treated',
        type: 'tinyint',
        width: 1,
        default: '0',
        isNullable: false,
      }));
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('call_log', 'treated')) {
      await qr.dropColumn('call_log', 'treated');
    }
  }
}
