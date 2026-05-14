import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexPlanning1778716800009 implements MigrationInterface {
  name = 'OptimisationIndexPlanning1778716800009';

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
      queryRunner, 'work_schedule', 'IDX_ws_commercial_active',
      '`commercial_id`, `is_active`',
    );
    await this.addIndexIfMissing(
      queryRunner, 'work_schedule', 'IDX_ws_group_active_day',
      '`group_id`, `day_of_week`, `is_active`',
    );
    await this.addIndexIfMissing(
      queryRunner, 'commercial_session', 'IDX_sess_commercial_connected',
      '`commercial_id`, `connected_at`',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`work_schedule\` DROP INDEX IF EXISTS \`IDX_ws_commercial_active\``);
    await queryRunner.query(`ALTER TABLE \`work_schedule\` DROP INDEX IF EXISTS \`IDX_ws_group_active_day\``);
    await queryRunner.query(`ALTER TABLE \`commercial_session\` DROP INDEX IF EXISTS \`IDX_sess_commercial_connected\``);
  }
}
