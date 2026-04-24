import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class Sprint2FollowUpReminder1745942400002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('follow_up', 'reminded_at'))) {
      await qr.addColumn('follow_up', new TableColumn({
        name: 'reminded_at',
        type: 'timestamp',
        isNullable: true,
        default: null,
      }));
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('follow_up', 'reminded_at')) {
      await qr.dropColumn('follow_up', 'reminded_at');
    }
  }
}
