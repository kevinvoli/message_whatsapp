import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class Phase4ContactReferral1745200000010 implements MigrationInterface {
  name = 'Phase4ContactReferral1745200000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('contact', 'referral_code'))) {
      await queryRunner.addColumn('contact', new TableColumn({
        name: 'referral_code', type: 'varchar', length: '50', isNullable: true, default: null,
      }));
    }
    if (!(await queryRunner.hasColumn('contact', 'referral_count'))) {
      await queryRunner.addColumn('contact', new TableColumn({
        name: 'referral_count', type: 'int', isNullable: true, default: null,
      }));
    }
    if (!(await queryRunner.hasColumn('contact', 'referral_commission'))) {
      await queryRunner.addColumn('contact', new TableColumn({
        name: 'referral_commission', type: 'decimal', precision: 12, scale: 2,
        isNullable: true, default: null,
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['referral_code', 'referral_count', 'referral_commission']) {
      if (await queryRunner.hasColumn('contact', col)) {
        await queryRunner.dropColumn('contact', col);
      }
    }
  }
}
