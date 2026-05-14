import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexErp1778716800012 implements MigrationInterface {
  name = 'OptimisationIndexErp1778716800012';

  private async addIndexIfMissing(
    qr: QueryRunner,
    table: string,
    index: string,
    columns: string,
  ): Promise<void> {
    const rows = await qr.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, index],
    );
    if (parseInt(rows[0]?.cnt ?? '0', 10) === 0) {
      await qr.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.addIndexIfMissing(
      queryRunner, 'contact', 'IDX_contact_order_client_id',
      '`order_client_id`',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contact\` DROP INDEX IF EXISTS \`IDX_contact_order_client_id\``);
  }
}
