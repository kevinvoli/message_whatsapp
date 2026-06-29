import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToCommercialGroup1783000000008 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (!(await qr.hasColumn('commercial_group', 'deleted_at'))) {
      await qr.query(
        `ALTER TABLE \`commercial_group\` ADD COLUMN \`deleted_at\` datetime NULL DEFAULT NULL`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('commercial_group', 'deleted_at')) {
      await qr.query(`ALTER TABLE \`commercial_group\` DROP COLUMN \`deleted_at\``);
    }
  }
}
